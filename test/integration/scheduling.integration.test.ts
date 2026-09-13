import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { cardStates, reviewLogs, students, teachers } from '../../src/db/schema.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const content = {
  question: 'Qual o rendimento máximo teórico de uma máquina de Carnot?',
  keyTerm: 'Ciclo de Carnot',
  highlightTerm: 'rendimento máximo',
  options: [
    { id: 'A', label: 'n = 1 - T2/T1' },
    { id: 'B', label: 'n = T1 + T2' },
    { id: 'C', label: 'n = Q1 / Q2' },
    { id: 'D', label: 'n = 0' },
  ],
  correctOptionId: 'A',
  imageUrl: null,
};

describe.skipIf(!connectionString)('agendamento contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  let app: FastifyInstance;
  let studentId = '';
  let teacherId = '';
  let themeId = '';
  const asStudent = { 'x-student-id': '' };
  const asTeacher = { 'x-teacher-id': '' };

  const createCard = async (question: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/themes/${themeId}/cards`,
      headers: asTeacher,
      payload: { ...content, question },
    });
    return response.json();
  };

  beforeAll(async () => {
    app = await buildApp({ db, logLevel: 'silent' });
    await app.ready();

    const [student] = await db
      .insert(students)
      .values({ displayName: 'Júlia', newCardsPerDay: 2 })
      .returning();
    const [teacher] = await db.insert(teachers).values({ displayName: 'Marcos' }).returning();
    studentId = student?.id ?? '';
    teacherId = teacher?.id ?? '';
    asStudent['x-student-id'] = studentId;
    asTeacher['x-teacher-id'] = teacherId;

    const notebook = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: asStudent,
      payload: { title: 'Física II' },
    });
    const theme = await app.inject({
      method: 'POST',
      url: `/api/notebooks/${notebook.json().id}/themes`,
      headers: asStudent,
      payload: { title: 'Termodinâmica' },
    });
    themeId = theme.json().id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from students where id = ${studentId}`);
    await db.execute(sql`delete from teachers where id = ${teacherId}`);
    await app.close();
    await pool.end();
  });

  it('a fila do dia respeita o teto de cards novos', async () => {
    await createCard('Pergunta 1');
    await createCard('Pergunta 2');
    await createCard('Pergunta 3');

    const queue = await app.inject({ method: 'GET', url: '/api/queue/today', headers: asStudent });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().cards).toHaveLength(2);
    expect(queue.json().cards[0].subject).toBe('Física II');
    expect(queue.json().cards[0].chapter).toBe('Termodinâmica');
  });

  it('registrar a revisão cria o estado FSRS do aluno e agenda o próximo encontro', async () => {
    const card = await createCard('Pergunta agendada');
    const reviewedAt = new Date().toISOString();

    const response = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: asStudent,
      payload: { cardId: card.id, rating: 'good', reviewedAt },
    });
    expect(response.statusCode).toBe(200);
    expect(new Date(response.json().nextDue).getTime()).toBeGreaterThan(Date.parse(reviewedAt));

    const [state] = await db.select().from(cardStates).where(eq(cardStates.cardId, card.id));
    expect(state?.reps).toBe(1);

    const logs = await db.select().from(reviewLogs).where(eq(reviewLogs.cardId, card.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.origin).toBe('feed');
    expect(logs[0]?.cardVersion).toBe(1);
  });

  it('reenviar a mesma revisão não duplica log nem reagenda', async () => {
    const card = await createCard('Pergunta reenviada');
    const payload = { cardId: card.id, rating: 'hard', reviewedAt: new Date().toISOString() };

    const first = await app.inject({ method: 'POST', url: '/api/reviews', headers: asStudent, payload });
    const second = await app.inject({ method: 'POST', url: '/api/reviews', headers: asStudent, payload });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const logs = await db.select().from(reviewLogs).where(eq(reviewLogs.cardId, card.id));
    expect(logs).toHaveLength(1);
  });

  it('card já revisado sai da fila até ficar devido de novo', async () => {
    const card = await createCard('Pergunta fora da fila');
    await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: asStudent,
      payload: { cardId: card.id, rating: 'easy', reviewedAt: new Date().toISOString() },
    });

    const queue = await app.inject({ method: 'GET', url: '/api/queue/today', headers: asStudent });
    expect(queue.json().cards.map((item: { id: string }) => item.id)).not.toContain(card.id);
  });

  it('recusa revisão de card que não é do aluno', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: asStudent,
      payload: {
        cardId: '99999999-9999-4999-8999-999999999999',
        rating: 'good',
        reviewedAt: new Date().toISOString(),
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
