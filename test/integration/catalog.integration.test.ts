import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { cards, students, themes } from '../../src/db/schema.js';
import { createNotebookRepository } from '../../src/modules/catalog/catalog.repository.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!connectionString)('catálogo contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  const repository = createNotebookRepository(db);
  const service = createCatalogService(repository);
  let studentId = '';
  let app: FastifyInstance;

  beforeAll(async () => {
    const [student] = await db.insert(students).values({ displayName: 'Aluno Teste' }).returning();
    studentId = student?.id ?? '';
    app = await buildApp({ db, logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await db.execute(sql`delete from students where id = ${studentId}`);
    await app.close();
    await pool.end();
  });

  it('cria cadernos e os devolve na biblioteca do aluno', async () => {
    const biologia = await service.createNotebook(studentId, {
      title: 'Biologia',
      subject: 'Ciências',
      sourceLabel: 'Foto de quadro-negro',
    });
    expect(biologia.subject).toBe('Ciências');
    expect(biologia.sourceLabel).toBe('Foto de quadro-negro');

    const historia = await service.createNotebook(studentId, { title: 'História' });
    expect(historia.sourceLabel).toBe('Caderno fotografado');

    const library = await service.getLibrary(studentId);
    expect(library.notebooks.map((notebook) => notebook.title)).toEqual(['Biologia', 'História']);
    expect(library.totalConcepts).toBe(0);
  });

  it('conta no caderno apenas o card aprovado', async () => {
    const notebook = await service.createNotebook(studentId, { title: 'Física II' });
    const [theme] = await db
      .insert(themes)
      .values({ notebookId: notebook.id, title: 'Termodinâmica' })
      .returning();

    await db.insert(cards).values([
      { themeId: theme?.id ?? '', prompt: 'Ciclo de Carnot?', answer: 'n = 1 - T2/T1', status: 'approved' },
      { themeId: theme?.id ?? '', prompt: 'Entropia?', answer: 'dS >= 0', status: 'pending' },
    ]);

    const detail = await service.getNotebook(studentId, notebook.id);
    expect(detail.cardCount).toBe(1);
    expect(detail.themes).toEqual([
      { id: theme?.id, title: 'Termodinâmica', cardCount: 1 },
    ]);
  });

  it('recusa caderno com título repetido para o mesmo aluno', async () => {
    await service.createNotebook(studentId, { title: 'Química' });
    await expect(service.createNotebook(studentId, { title: 'Química' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('devolve 404 no caderno que não é do aluno', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notebooks/99999999-9999-4999-8999-999999999999',
      headers: { 'x-student-id': studentId },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('devolve 422 quando o aluno do header não existe', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: { 'x-student-id': '99999999-9999-4999-8999-999999999999' },
      payload: { title: 'Geografia' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('invalid_reference');
  });
});
