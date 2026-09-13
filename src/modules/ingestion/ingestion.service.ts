import { notFound } from '../../shared/http/errors.js';
import type { CardGenerator } from './card-generator.js';
import type { IngestionRepository } from './ingestion.repository.js';
import type { IngestBody, IngestResponse } from './ingestion.schemas.js';

export interface IngestionService {
  ingest: (studentId: string, notebookId: string, body: IngestBody) => Promise<IngestResponse>;
}

export const createIngestionService = (
  repository: IngestionRepository,
  generator: CardGenerator,
): IngestionService => ({
  ingest: async (studentId, notebookId, body) => {
    const owner = await repository.findNotebookOwner(notebookId);
    if (owner !== studentId) throw notFound('Caderno não encontrado para este aluno.');

    const generated = await generator.generate({
      ...(body.imageUri ? { imageUri: body.imageUri } : {}),
      ...(body.topic ? { topic: body.topic } : {}),
    });

    const themeIds = new Map<string, string>();
    const stored: IngestResponse['cards'] = [];

    for (const card of generated.cards) {
      const cached = themeIds.get(card.theme);
      const themeId = cached ?? (await repository.findOrCreateTheme(notebookId, card.theme));
      themeIds.set(card.theme, themeId);

      const saved = await repository.saveGenerated(themeId, card);
      stored.push({
        id: saved.id,
        themeId,
        status: 'pending',
        format: card.format,
        question: card.question,
        keyTerm: card.keyTerm,
        highlightTerm: card.highlightTerm,
        options: card.options,
        correctOptionId: card.correctOptionId,
      });
    }

    return { confidence: generated.confidence, cards: stored };
  },
});
