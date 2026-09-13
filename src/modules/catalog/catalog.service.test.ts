import { describe, expect, it } from 'vitest';
import { HttpError } from '../../shared/http/errors.js';
import type { NotebookRepository } from './catalog.repository.js';
import type { Notebook } from './catalog.schemas.js';
import { createCatalogService } from './catalog.service.js';

const studentId = '11111111-1111-4111-8111-111111111111';

const makeNotebook = (title: string, createdAt: string): Notebook => ({
  id: '22222222-2222-4222-8222-222222222222',
  title,
  subject: null,
  createdAt,
});

const makeRepository = (overrides: Partial<NotebookRepository> = {}): NotebookRepository => ({
  findByStudentAndTitle: async () => undefined,
  listByStudent: async () => [],
  create: async (_studentId, input) => makeNotebook(input.title, '2026-09-13T10:00:00.000Z'),
  ...overrides,
});

describe('catalog service', () => {
  it('cria caderno quando o título é inédito para o aluno', async () => {
    const service = createCatalogService(makeRepository());
    const created = await service.createNotebook(studentId, { title: 'Biologia' });
    expect(created.title).toBe('Biologia');
  });

  it('rejeita caderno duplicado com 409', async () => {
    const service = createCatalogService(
      makeRepository({
        findByStudentAndTitle: async () => makeNotebook('Biologia', '2026-09-13T10:00:00.000Z'),
      }),
    );
    await expect(service.createNotebook(studentId, { title: 'Biologia' })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(service.createNotebook(studentId, { title: 'Biologia' })).rejects.toBeInstanceOf(
      HttpError,
    );
  });

  it('devolve cursor quando a página está cheia', async () => {
    const service = createCatalogService(
      makeRepository({
        listByStudent: async () => [
          makeNotebook('A', '2026-09-13T10:00:00.000Z'),
          makeNotebook('B', '2026-09-12T10:00:00.000Z'),
        ],
      }),
    );
    const page = await service.listNotebooks(studentId, { limit: 2 });
    expect(page.nextCursor).toBe('2026-09-12T10:00:00.000Z');
  });

  it('devolve cursor nulo quando a página não encheu', async () => {
    const service = createCatalogService(
      makeRepository({
        listByStudent: async () => [makeNotebook('A', '2026-09-13T10:00:00.000Z')],
      }),
    );
    const page = await service.listNotebooks(studentId, {
      limit: 20,
      cursor: '2026-09-14T10:00:00.000Z',
    });
    expect(page.nextCursor).toBeNull();
  });
});
