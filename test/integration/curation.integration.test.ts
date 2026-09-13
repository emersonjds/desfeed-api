import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { cardVersions, students, teachers } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

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

describe.skipIf(!connectionString)('curadoria contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  let app: FastifyInstance;
  let studentId = '';
  let otherStudentId = '';
  let teacherId = '';
  let themeId = '';

  const asStudent = { 'x-student-id': '' };
  const asTeacher = { 'x-teacher-id': '' };

  beforeAll(async () => {
    app = await buildApp({ db, logLevel: 'silent' });
    await app.ready();

    const [student] = await db.insert(students).values({ displayName: 'Júlia' }).returning();
    const [other] = await db.insert(students).values({ displayName: 'Colega' }).returning();
    const [teacher] = await db.insert(teachers).values({ displayName: 'Marcos' }).returning();
    studentId = student?.id ?? '';
    otherStudentId = other?.id ?? '';
    teacherId = teacher?.id ?? '';
    asStudent['x-student-id'] = studentId;
    asTeacher['x-teacher-id'] = teacherId;

    const notebook = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: asStudent,
      payload: { title: 'Física II', subject: 'Termodinâmica' },
    });
    const theme = await app.inject({
      method: 'POST',
      url: `/api/notebooks/${notebook.json().id}/themes`,
      headers: asStudent,
      payload: { title: 'Ciclo de Carnot' },
    });
    themeId = theme.json().id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from students where id in (${studentId}, ${otherStudentId})`);
    await db.execute(sql`delete from teachers where id = ${teacherId}`);
    await app.close();
    await pool.end();
  });

  const createCard = async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/themes/${themeId}/cards`,
      headers: asTeacher,
      payload: content,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  };

  it('card criado pelo professor aparece para o aluno dono do tema', async () => {
    const created = await createCard();
    expect(created.status).toBe('approved');

    const listed = await app.inject({
      method: 'GET',
      url: `/api/themes/${themeId}/cards`,
      headers: asStudent,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.map((item: { id: string }) => item.id)).toContain(created.id);
  });

  it('card rejeitado some da lista do aluno', async () => {
    const created = await createCard();
    const decided = await app.inject({
      method: 'POST',
      url: `/api/cards/${created.id}/decision`,
      headers: asTeacher,
      payload: { decision: 'rejected' },
    });
    expect(decided.statusCode).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/themes/${themeId}/cards`,
      headers: asStudent,
    });
    expect(listed.json().items.map((item: { id: string }) => item.id)).not.toContain(created.id);
  });

  it('editar o card preserva a versão anterior', async () => {
    const created = await createCard();
    const edited = await app.inject({
      method: 'PUT',
      url: `/api/cards/${created.id}`,
      headers: asTeacher,
      payload: { ...content, question: 'Qual a eficiência do ciclo de Carnot?' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().version).toBe(2);

    const versions = await db
      .select()
      .from(cardVersions)
      .where(eq(cardVersions.cardId, created.id));
    expect(versions).toHaveLength(2);
    expect(versions.find((version) => version.version === 1)?.question).toBe(content.question);
  });

  it('report de erro factual tira o card da fila de todos e vai para curadoria', async () => {
    const created = await createCard();
    const reported = await app.inject({
      method: 'POST',
      url: `/api/cards/${created.id}/reports`,
      headers: asStudent,
      payload: { reason: 'factualmente-errado', comment: 'A fórmula está invertida.' },
    });
    expect(reported.statusCode).toBe(201);
    expect(reported.json().status).toBe('under_review');

    const listedForOther = await app.inject({
      method: 'GET',
      url: `/api/themes/${themeId}/cards`,
      headers: { 'x-student-id': studentId },
    });
    expect(listedForOther.json().items.map((item: { id: string }) => item.id)).not.toContain(
      created.id,
    );

    const curation = await app.inject({
      method: 'GET',
      url: '/api/curation/cards',
      headers: asTeacher,
    });
    expect(curation.json().items.map((item: { id: string }) => item.id)).toContain(created.id);
  });

  it('recusa o segundo report do mesmo aluno no mesmo card', async () => {
    const created = await createCard();
    const payload = { reason: 'confuso' };
    await app.inject({
      method: 'POST',
      url: `/api/cards/${created.id}/reports`,
      headers: asStudent,
      payload,
    });
    const repeated = await app.inject({
      method: 'POST',
      url: `/api/cards/${created.id}/reports`,
      headers: asStudent,
      payload,
    });
    expect(repeated.statusCode).toBe(409);
  });

  it('recusa o aluno que não é dono do tema', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: `/api/themes/${themeId}/cards`,
      headers: { 'x-student-id': otherStudentId },
    });
    expect(listed.statusCode).toBe(404);
  });
});
