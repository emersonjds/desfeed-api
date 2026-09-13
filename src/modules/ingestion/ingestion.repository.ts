import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cardVersions, cards, notebooks, themes } from '../../db/schema.js';
import type { GeneratedCard } from './ingestion.schemas.js';

export interface StoredCard {
  id: string;
  themeId: string;
}

export interface IngestionRepository {
  findNotebookOwner: (notebookId: string) => Promise<string | null | undefined>;
  findOrCreateTheme: (notebookId: string, title: string) => Promise<string>;
  saveGenerated: (themeId: string, generated: GeneratedCard) => Promise<StoredCard>;
}

export const createIngestionRepository = (db: Database): IngestionRepository => ({
  findNotebookOwner: async (notebookId) => {
    const [row] = await db
      .select({ studentId: notebooks.studentId })
      .from(notebooks)
      .where(eq(notebooks.id, notebookId))
      .limit(1);
    return row?.studentId;
  },

  findOrCreateTheme: async (notebookId, title) => {
    const [existing] = await db
      .select({ id: themes.id })
      .from(themes)
      .where(and(eq(themes.notebookId, notebookId), eq(themes.title, title)))
      .limit(1);
    if (existing) return existing.id;

    const [created] = await db.insert(themes).values({ notebookId, title }).returning();
    if (!created) throw new Error('theme insert returned no row');
    return created.id;
  },

  saveGenerated: async (themeId, generated) =>
    db.transaction(async (tx) => {
      const [card] = await tx
        .insert(cards)
        .values({ themeId, status: 'pending', source: 'ai' })
        .returning();
      if (!card) throw new Error('card insert returned no row');

      await tx.insert(cardVersions).values({
        cardId: card.id,
        version: 1,
        question: generated.question,
        keyTerm: generated.keyTerm,
        highlightTerm: generated.highlightTerm,
        options: generated.options,
        correctOptionId: generated.correctOptionId,
      });

      return { id: card.id, themeId };
    }),
});
