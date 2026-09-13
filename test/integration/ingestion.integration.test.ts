import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { cards, students } from '../../src/db/schema.js';
import type { CardGenerator } from '../../src/modules/ingestion/card-generator.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const generatedCard = (question: string, theme = 'Termodinâmica') => ({
  format: 'pergunta-direta' as const,
  theme,
  question,
  keyTerm: 'Ciclo de Carnot',
  highlightTerm: 'rendimento máximo',
  options: [
    { id: 'A' as const, label: 'n = 1 - T2/T1' },
    { id: 'B' as const, label: 'n = T1 + T2' },
    { id: 'C' as const, label: 'n = Q1 / Q2' },
    { id: 'D' as const, label: 'n = 0' },
  ],
  correctOptionId: 'A' as const,
});

const generator: CardGenerator = {
  generate: async () => ({
    confidence: 'alta',
    cards: [generatedCard('Qual o rendimento de Carnot?'), generatedCard('O que é entropia?', 'Entropia')],
  }),
};

describe.skipIf(!connectionString)('ingestão contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  let app: FastifyInstance;
  let studentId = '';
  let notebookId = '';
  const asStudent = { 'x-student-id': '' };

  beforeAll(async () => {
    app = await buildApp({ db, logLevel: 'silent', cardGenerator: generator });
    await app.ready();

    const [student] = await db.insert(students).values({ displayName: 'Júlia' }).returning();
    studentId = student?.id ?? '';
    asStudent['x-student-id'] = studentId;

    const notebook = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: asStudent,
      payload: { title: 'Física II' },
    });
    notebookId = notebook.json().id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from students where id = ${studentId}`);
    await app.close();
    await pool.end();
  });

  it('a foto vira cards pendentes, agrupados por tema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/notebooks/${notebookId}/ingest`,
      headers: asStudent,
      payload: { imageUri: 'data:image/png;base64,iVBORw0KGgo=' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().cards).toHaveLength(2);
    expect(response.json().cards.every((card: { status: string }) => card.status === 'pending')).toBe(
      true,
    );

    const detail = await app.inject({
      method: 'GET',
      url: `/api/notebooks/${notebookId}`,
      headers: asStudent,
    });
    expect(detail.json().themes.map((theme: { title: string }) => theme.title)).toEqual([
      'Entropia',
      'Termodinâmica',
    ]);
  });

  it('card gerado não entra na fila do aluno antes da curadoria', async () => {
    const queue = await app.inject({ method: 'GET', url: '/api/queue/today', headers: asStudent });
    expect(queue.json().cards).toEqual([]);

    const stored = await db.select().from(cards).where(eq(cards.status, 'pending'));
    expect(stored.length).toBeGreaterThan(0);
  });

  it('recusa caderno de outro aluno', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebooks/99999999-9999-4999-8999-999999999999/ingest',
      headers: asStudent,
      payload: { topic: 'Termodinâmica' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('responde 503 quando a chave do provedor não está configurada', async () => {
    const withoutGenerator = await buildApp({ db, logLevel: 'silent' });
    await withoutGenerator.ready();
    const response = await withoutGenerator.inject({
      method: 'POST',
      url: `/api/notebooks/${notebookId}/ingest`,
      headers: asStudent,
      payload: { topic: 'Termodinâmica' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('generation_unavailable');
    await withoutGenerator.close();
  });
});
