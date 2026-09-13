import { describe, expect, it } from 'vitest';
import type { CardGenerator } from './card-generator.js';
import type { IngestionRepository } from './ingestion.repository.js';
import { createIngestionService } from './ingestion.service.js';
import type { GeneratedCard } from './ingestion.schemas.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const notebookId = '22222222-2222-4222-8222-222222222222';

const makeGenerated = (overrides: Partial<GeneratedCard> = {}): GeneratedCard => ({
  format: 'pergunta-direta',
  theme: 'Termodinâmica',
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
  ...overrides,
});

const makeRepository = (overrides: Partial<IngestionRepository> = {}): IngestionRepository => ({
  findNotebookOwner: async () => studentId,
  findOrCreateTheme: async (_notebookId, title) => `theme-${title}`,
  saveGenerated: async (themeId) => ({ id: crypto.randomUUID(), themeId }),
  ...overrides,
});

const makeGenerator = (cards: GeneratedCard[], confidence: 'alta' | 'media' | 'baixa' = 'alta'): CardGenerator => ({
  generate: async () => ({ confidence, cards }),
});

describe('ingestion service', () => {
  it('recusa caderno de outro aluno', async () => {
    const service = createIngestionService(
      makeRepository({ findNotebookOwner: async () => 'outro' }),
      makeGenerator([makeGenerated()]),
    );
    await expect(
      service.ingest(studentId, notebookId, { imageUri: 'https://exemplo.test/foto.jpg' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('card gerado nasce pendente de curadoria', async () => {
    const service = createIngestionService(makeRepository(), makeGenerator([makeGenerated()]));
    const result = await service.ingest(studentId, notebookId, { topic: 'Termodinâmica' });
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.status).toBe('pending');
    expect(result.confidence).toBe('alta');
  });

  it('reaproveita o tema entre cards da mesma leva', async () => {
    const created: string[] = [];
    const service = createIngestionService(
      makeRepository({
        findOrCreateTheme: async (_notebookId, title) => {
          created.push(title);
          return `theme-${title}`;
        },
      }),
      makeGenerator([
        makeGenerated(),
        makeGenerated({ question: 'O que é entropia?' }),
        makeGenerated({ theme: 'Leis dos gases' }),
      ]),
    );
    const result = await service.ingest(studentId, notebookId, { topic: 'Física' });
    expect(created).toEqual(['Termodinâmica', 'Leis dos gases']);
    expect(result.cards).toHaveLength(3);
  });

  it('preserva o formato escolhido pelo gerador', async () => {
    const service = createIngestionService(
      makeRepository(),
      makeGenerator([makeGenerated({ format: 'flashcard-reverso' })]),
    );
    const result = await service.ingest(studentId, notebookId, { topic: 'Física' });
    expect(result.cards[0]?.format).toBe('flashcard-reverso');
  });

  it('propaga a falha do gerador sem gravar card', async () => {
    let saves = 0;
    const service = createIngestionService(
      makeRepository({
        saveGenerated: async (themeId) => {
          saves += 1;
          return { id: crypto.randomUUID(), themeId };
        },
      }),
      {
        generate: async () => {
          throw new Error('modelo fora do ar');
        },
      },
    );
    await expect(service.ingest(studentId, notebookId, { topic: 'Física' })).rejects.toThrow(
      'modelo fora do ar',
    );
    expect(saves).toBe(0);
  });
});
