import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { students, teachers } from '../../src/db/schema.js';

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

describe.skipIf(!connectionString)('gamificação contra o Postgres', () => {
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

  const review = async (cardId: string, reviewedAt: string, rating = 'good') =>
    app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: asStudent,
      payload: { cardId, rating, reviewedAt },
    });

  beforeAll(async () => {
    app = await buildApp({ db, logLevel: 'silent' });
    await app.ready();

    const [student] = await db
      .insert(students)
      .values({ displayName: 'Júlia Menezes', dailyGoal: 2, newCardsPerDay: 10 })
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

  it('a revisão alimenta a sessão do dia e o XP vem do servidor', async () => {
    const card = await createCard('Pergunta da sessão');
    const response = await review(card.id, new Date().toISOString());
    expect(response.statusCode).toBe(200);

    const session = await app.inject({
      method: 'GET',
      url: '/api/session/today',
      headers: asStudent,
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().completed).toBe(1);
    expect(session.json().goal).toBe(2);
    expect(session.json().xp).toBe(response.json().xpGained);
  });

  it('reenviar a mesma revisão não duplica XP nem contagem', async () => {
    const card = await createCard('Pergunta reenviada na sessão');
    const reviewedAt = new Date().toISOString();
    await review(card.id, reviewedAt);

    const before = await app.inject({ method: 'GET', url: '/api/session/today', headers: asStudent });
    await review(card.id, reviewedAt);
    const after = await app.inject({ method: 'GET', url: '/api/session/today', headers: asStudent });

    expect(after.json()).toEqual(before.json());
  });

  it('cumprir a meta do dia acende o streak', async () => {
    const first = await createCard('Meta 1');
    const second = await createCard('Meta 2');
    await review(first.id, new Date().toISOString());
    await review(second.id, new Date().toISOString());

    const session = await app.inject({
      method: 'GET',
      url: '/api/session/today',
      headers: asStudent,
    });
    expect(session.json().completed).toBeGreaterThanOrEqual(2);
    expect(session.json().streak).toBe(1);
  });

  it('reduzir a meta mantém o streak do dia já cumprido', async () => {
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      headers: asStudent,
      payload: { dailyGoal: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().dailyGoal).toBe(1);

    const session = await app.inject({
      method: 'GET',
      url: '/api/session/today',
      headers: asStudent,
    });
    expect(session.json().streak).toBe(1);
  });

  it('o perfil reflete as revisões feitas', async () => {
    const profile = await app.inject({ method: 'GET', url: '/api/profile', headers: asStudent });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().cardsReviewed).toBeGreaterThan(0);
    expect(profile.json().handle).toBe('@juliamenezes');
    expect(profile.json().activeDaysLast30).toBe(1);
  });

  it('o ranking coloca o aluno na liga bronze da semana', async () => {
    const ranking = await app.inject({ method: 'GET', url: '/api/ranking', headers: asStudent });
    expect(ranking.statusCode).toBe(200);
    const current = ranking
      .json()
      .entries.find((entry: { isCurrentUser: boolean }) => entry.isCurrentUser);
    expect(current?.xp).toBeGreaterThan(0);
  });
});
