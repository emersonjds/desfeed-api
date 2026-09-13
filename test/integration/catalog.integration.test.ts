import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { students } from '../../src/db/schema.js';
import { createNotebookRepository } from '../../src/modules/catalog/catalog.repository.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { buildApp } from '../../src/app.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!connectionString)('catálogo contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  const repository = createNotebookRepository(db);
  const service = createCatalogService(repository);
  let studentId = '';

  beforeAll(async () => {
    const [student] = await db.insert(students).values({ displayName: 'Aluno Teste' }).returning();
    studentId = student?.id ?? '';
  });

  afterAll(async () => {
    await db.execute(sql`delete from students where id = ${studentId}`);
    await pool.end();
  });

  it('cria, encontra e pagina cadernos do aluno', async () => {
    const primeiro = await service.createNotebook(studentId, {
      title: 'Biologia',
      subject: 'Ciências',
    });
    expect(primeiro.subject).toBe('Ciências');

    const segundo = await service.createNotebook(studentId, { title: 'História' });
    expect(segundo.subject).toBeNull();

    const encontrado = await repository.findByStudentAndTitle(studentId, 'Biologia');
    expect(encontrado?.id).toBe(primeiro.id);

    const primeiraPagina = await service.listNotebooks(studentId, { limit: 1 });
    expect(primeiraPagina.items).toHaveLength(1);
    expect(primeiraPagina.nextCursor).not.toBeNull();

    const segundaPagina = await service.listNotebooks(studentId, {
      limit: 10,
      cursor: primeiraPagina.nextCursor ?? '',
    });
    expect(segundaPagina.items.map((item) => item.title)).not.toContain(
      primeiraPagina.items[0]?.title,
    );
    expect(segundaPagina.nextCursor).toBeNull();
  });

  it('devolve 422 quando o aluno do header não existe', async () => {
    const app = await buildApp({ db, logLevel: 'silent' });
    const response = await app.inject({
      method: 'POST',
      url: '/notebooks',
      headers: { 'x-student-id': '99999999-9999-4999-8999-999999999999' },
      payload: { title: 'Geografia' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('invalid_reference');
    await app.close();
  });

  it('recusa caderno com título repetido para o mesmo aluno', async () => {
    await service.createNotebook(studentId, { title: 'Química' });
    await expect(service.createNotebook(studentId, { title: 'Química' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
