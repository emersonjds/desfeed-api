import { describe, expect, it } from 'vitest';
import type { CardRepository } from './cards.repository.js';
import type { Card, CardContent, CardStatus } from './cards.schemas.js';
import { createCardService } from './cards.service.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const teacherId = '44444444-4444-4444-8444-444444444444';
const themeId = '33333333-3333-4333-8333-333333333333';
const cardId = '55555555-5555-4555-8555-555555555555';

const content: CardContent = {
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

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  ...content,
  id: cardId,
  themeId,
  status: 'pending',
  source: 'ai',
  version: 1,
  createdAt: '2026-09-13T10:00:00.000Z',
  ...overrides,
});

const makeRepository = (overrides: Partial<CardRepository> = {}): CardRepository => ({
  findThemeOwner: async () => studentId,
  findNotebookOwner: async () => studentId,
  createTheme: async (notebookId, title) => ({
    id: themeId,
    notebookId,
    title,
    createdAt: '2026-09-13T10:00:00.000Z',
  }),
  createCard: async (_themeId, _content, status) => makeCard({ status, source: 'teacher' }),
  addVersion: async () => makeCard({ version: 2 }),
  listByTheme: async () => [],
  listForCuration: async () => [],
  setStatus: async (_cardId, status) => makeCard({ status }),
  findById: async () => makeCard({ status: 'approved' }),
  saveReport: async () => undefined,
  suspend: async () => makeCard({ status: 'under_review' }),
  ...overrides,
});

describe('card service', () => {
  it('cria tema no caderno do próprio aluno', async () => {
    const service = createCardService(makeRepository());
    const theme = await service.createTheme(studentId, '66666666-6666-4666-8666-666666666666', 'Termodinâmica');
    expect(theme.title).toBe('Termodinâmica');
  });

  it('recusa tema em caderno de outro aluno', async () => {
    const service = createCardService(makeRepository({ findNotebookOwner: async () => 'outro' }));
    await expect(
      service.createTheme(studentId, '66666666-6666-4666-8666-666666666666', 'Termodinâmica'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('card criado pelo professor já nasce aprovado', async () => {
    const service = createCardService(makeRepository());
    const created = await service.createCard(teacherId, themeId, content);
    expect(created.status).toBe('approved');
    expect(created.source).toBe('teacher');
  });

  it('aprova e rejeita em uma requisição', async () => {
    const service = createCardService(makeRepository());
    await expect(service.decide(teacherId, cardId, { decision: 'approved' })).resolves.toMatchObject(
      { status: 'approved' },
    );
    await expect(service.decide(teacherId, cardId, { decision: 'rejected' })).resolves.toMatchObject(
      { status: 'rejected' },
    );
  });

  it('recusa decisão sobre card inexistente', async () => {
    const service = createCardService(makeRepository({ setStatus: async () => undefined }));
    await expect(service.decide(teacherId, cardId, { decision: 'approved' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('editar o card cria versão nova', async () => {
    const service = createCardService(makeRepository());
    const edited = await service.editCard(teacherId, cardId, content);
    expect(edited.version).toBe(2);
  });

  it('recusa edição de card inexistente', async () => {
    const service = createCardService(makeRepository({ addVersion: async () => undefined }));
    await expect(service.editCard(teacherId, cardId, content)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lista apenas card aprovado para o aluno dono do tema', async () => {
    const statuses: CardStatus[][] = [];
    const service = createCardService(
      makeRepository({
        listByTheme: async (_themeId, requested) => {
          statuses.push(requested);
          return [makeCard({ status: 'approved' })];
        },
      }),
    );
    const page = await service.listApproved(studentId, themeId, { limit: 20 });
    expect(statuses).toEqual([['approved']]);
    expect(page.nextCursor).toBeNull();
  });

  it('recusa listagem de tema de outro aluno', async () => {
    const service = createCardService(makeRepository({ findThemeOwner: async () => 'outro' }));
    await expect(service.listApproved(studentId, themeId, { limit: 20 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('devolve cursor quando a página de curadoria enche', async () => {
    const service = createCardService(
      makeRepository({ listForCuration: async () => [makeCard(), makeCard()] }),
    );
    const page = await service.listCuration({ limit: 2 });
    expect(page.nextCursor).toBe('2026-09-13T10:00:00.000Z');
  });

  it('report de erro factual tira o card aprovado da fila', async () => {
    const service = createCardService(makeRepository());
    const accepted = await service.report(studentId, cardId, { reason: 'factualmente-errado' });
    expect(accepted.status).toBe('under_review');
  });

  it('report de outro motivo registra sem tirar o card da fila', async () => {
    const service = createCardService(makeRepository());
    const accepted = await service.report(studentId, cardId, {
      reason: 'confuso',
      comment: 'A pergunta tem duas leituras.',
    });
    expect(accepted.status).toBe('approved');
  });

  it('grava o report na versão que o aluno viu', async () => {
    const saved: number[] = [];
    const service = createCardService(
      makeRepository({
        findById: async () => makeCard({ status: 'approved', version: 3 }),
        saveReport: async (_cardId, _studentId, version) => {
          saved.push(version);
        },
      }),
    );
    await service.report(studentId, cardId, { reason: 'duplicado' });
    expect(saved).toEqual([3]);
  });

  it('recusa report repetido do mesmo aluno com 409', async () => {
    const service = createCardService(
      makeRepository({
        saveReport: async () => {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        },
      }),
    );
    await expect(
      service.report(studentId, cardId, { reason: 'confuso' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('propaga erro de banco que não é de duplicidade', async () => {
    const service = createCardService(
      makeRepository({
        saveReport: async () => {
          throw new Error('conexão perdida');
        },
      }),
    );
    await expect(service.report(studentId, cardId, { reason: 'confuso' })).rejects.toThrow(
      'conexão perdida',
    );
  });

  it('recusa report em card inexistente', async () => {
    const service = createCardService(makeRepository({ findById: async () => undefined }));
    await expect(service.report(studentId, cardId, { reason: 'confuso' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
