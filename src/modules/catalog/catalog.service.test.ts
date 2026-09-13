import { describe, expect, it } from 'vitest';
import { HttpError } from '../../shared/http/errors.js';
import type { NotebookRepository } from './catalog.repository.js';
import type { NotebookDetail, NotebookSummary } from './catalog.schemas.js';
import { createCatalogService } from './catalog.service.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const notebookId = '22222222-2222-4222-8222-222222222222';

const makeSummary = (title: string, cardCount = 0): NotebookSummary => ({
  id: notebookId,
  title,
  subject: null,
  coverUrl: null,
  sourceLabel: 'Caderno fotografado',
  cardCount,
  status: null,
  retentionPercent: null,
  nextReviewLabel: null,
});

const makeDetail = (title: string): NotebookDetail => ({
  ...makeSummary(title, 3),
  createdAt: '2026-09-13T10:00:00.000Z',
  themes: [{ id: '33333333-3333-4333-8333-333333333333', title: 'Termodinâmica', cardCount: 3 }],
});

const makeRepository = (overrides: Partial<NotebookRepository> = {}): NotebookRepository => ({
  findByStudentAndTitle: async () => undefined,
  listByStudent: async () => [],
  findById: async () => undefined,
  create: async (_studentId, input) => makeSummary(input.title),
  ...overrides,
});

describe('catalog service', () => {
  it('cria caderno quando o título é inédito para o aluno', async () => {
    const service = createCatalogService(makeRepository());
    const created = await service.createNotebook(studentId, { title: 'Biologia' });
    expect(created.title).toBe('Biologia');
    expect(created.cardCount).toBe(0);
  });

  it('rejeita caderno duplicado com 409', async () => {
    const service = createCatalogService(
      makeRepository({ findByStudentAndTitle: async () => makeSummary('Biologia') }),
    );
    await expect(service.createNotebook(studentId, { title: 'Biologia' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('soma os cards dos cadernos no total de conceitos da biblioteca', async () => {
    const service = createCatalogService(
      makeRepository({
        listByStudent: async () => [makeSummary('Biologia', 12), makeSummary('História', 7)],
      }),
    );
    const library = await service.getLibrary(studentId);
    expect(library.totalConcepts).toBe(19);
    expect(library.notebooks).toHaveLength(2);
  });

  it('deixa nula a métrica que depende do agendamento', async () => {
    const service = createCatalogService(makeRepository());
    const library = await service.getLibrary(studentId);
    expect(library.globalRetentionPercent).toBeNull();
    expect(library.stabilityDays).toBeNull();
    expect(library.peaks).toEqual([]);
  });

  it('devolve o detalhe do caderno com seus temas', async () => {
    const service = createCatalogService(
      makeRepository({ findById: async () => makeDetail('Física II') }),
    );
    const detail = await service.getNotebook(studentId, notebookId);
    expect(detail.themes[0]?.title).toBe('Termodinâmica');
  });

  it('rejeita caderno de outro aluno com 404', async () => {
    const service = createCatalogService(makeRepository());
    await expect(service.getNotebook(studentId, notebookId)).rejects.toBeInstanceOf(HttpError);
    await expect(service.getNotebook(studentId, notebookId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
