import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cardReports, cardVersions, cards, notebooks, themes } from '../../db/schema.js';
import type { Card, CardContent, CardStatus, ReportBody, Theme } from './cards.schemas.js';

export interface CardRepository {
  findThemeOwner: (themeId: string) => Promise<string | null | undefined>;
  findNotebookOwner: (notebookId: string) => Promise<string | null | undefined>;
  createTheme: (notebookId: string, title: string) => Promise<Theme>;
  createCard: (themeId: string, content: CardContent, status: CardStatus) => Promise<Card>;
  addVersion: (cardId: string, content: CardContent) => Promise<Card | undefined>;
  listByTheme: (
    themeId: string,
    statuses: CardStatus[],
    limit: number,
    cursor?: Date,
  ) => Promise<Card[]>;
  listForCuration: (limit: number, cursor?: Date) => Promise<Card[]>;
  setStatus: (cardId: string, status: CardStatus, teacherId: string) => Promise<Card | undefined>;
  findById: (cardId: string) => Promise<Card | undefined>;
  saveReport: (
    cardId: string,
    studentId: string,
    version: number,
    input: ReportBody,
  ) => Promise<void>;
  suspend: (cardId: string) => Promise<Card>;
}

type CardRow = typeof cards.$inferSelect;
type VersionRow = typeof cardVersions.$inferSelect;

const toCard = (cardRow: CardRow, version: VersionRow): Card => ({
  id: cardRow.id,
  themeId: cardRow.themeId,
  status: cardRow.status,
  source: cardRow.source,
  version: version.version,
  question: version.question,
  keyTerm: version.keyTerm,
  highlightTerm: version.highlightTerm,
  options: version.options,
  correctOptionId: version.correctOptionId as Card['correctOptionId'],
  imageUrl: version.imageUrl,
  createdAt: cardRow.createdAt.toISOString(),
});

const currentVersionJoin = (db: Database) =>
  db
    .select({ card: cards, version: cardVersions })
    .from(cards)
    .innerJoin(
      cardVersions,
      and(eq(cardVersions.cardId, cards.id), eq(cardVersions.version, cards.currentVersion)),
    );

export const createCardRepository = (db: Database): CardRepository => ({
  findThemeOwner: async (themeId) => {
    const [row] = await db
      .select({ studentId: notebooks.studentId })
      .from(themes)
      .innerJoin(notebooks, eq(notebooks.id, themes.notebookId))
      .where(eq(themes.id, themeId))
      .limit(1);
    return row?.studentId;
  },

  findNotebookOwner: async (notebookId) => {
    const [row] = await db
      .select({ studentId: notebooks.studentId })
      .from(notebooks)
      .where(eq(notebooks.id, notebookId))
      .limit(1);
    return row?.studentId;
  },

  createTheme: async (notebookId, title) => {
    const [row] = await db.insert(themes).values({ notebookId, title }).returning();
    if (!row) throw new Error('theme insert returned no row');
    return {
      id: row.id,
      notebookId: row.notebookId,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
    };
  },

  createCard: async (themeId, content, status) =>
    db.transaction(async (tx) => {
      const [cardRow] = await tx
        .insert(cards)
        .values({ themeId, status, source: status === 'approved' ? 'teacher' : 'ai' })
        .returning();
      if (!cardRow) throw new Error('card insert returned no row');
      const [versionRow] = await tx
        .insert(cardVersions)
        .values({ cardId: cardRow.id, version: 1, ...content })
        .returning();
      if (!versionRow) throw new Error('card version insert returned no row');
      return toCard(cardRow, versionRow);
    }),

  addVersion: async (cardId, content) =>
    db.transaction(async (tx) => {
      const [cardRow] = await tx
        .update(cards)
        .set({ currentVersion: sql`${cards.currentVersion} + 1` })
        .where(eq(cards.id, cardId))
        .returning();
      if (!cardRow) return undefined;
      const [versionRow] = await tx
        .insert(cardVersions)
        .values({ cardId, version: cardRow.currentVersion, ...content })
        .returning();
      if (!versionRow) throw new Error('card version insert returned no row');
      return toCard(cardRow, versionRow);
    }),

  listByTheme: async (themeId, statuses, limit, cursor) => {
    const rows = await currentVersionJoin(db)
      .where(
        and(
          eq(cards.themeId, themeId),
          inArray(cards.status, statuses),
          cursor ? lt(cards.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(cards.createdAt))
      .limit(limit);
    return rows.map((row) => toCard(row.card, row.version));
  },

  listForCuration: async (limit, cursor) => {
    const rows = await currentVersionJoin(db)
      .where(
        and(
          inArray(cards.status, ['pending', 'under_review']),
          cursor ? lt(cards.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(cards.createdAt))
      .limit(limit);
    return rows.map((row) => toCard(row.card, row.version));
  },

  setStatus: async (cardId, status, teacherId) => {
    const [cardRow] = await db
      .update(cards)
      .set({ status, reviewedBy: teacherId, reviewedAt: new Date() })
      .where(eq(cards.id, cardId))
      .returning();
    if (!cardRow) return undefined;
    const [versionRow] = await db
      .select()
      .from(cardVersions)
      .where(and(eq(cardVersions.cardId, cardId), eq(cardVersions.version, cardRow.currentVersion)))
      .limit(1);
    return versionRow ? toCard(cardRow, versionRow) : undefined;
  },

  findById: async (cardId) => {
    const [row] = await currentVersionJoin(db).where(eq(cards.id, cardId)).limit(1);
    return row ? toCard(row.card, row.version) : undefined;
  },

  suspend: async (cardId) => {
    const [cardRow] = await db
      .update(cards)
      .set({ status: 'under_review' })
      .where(eq(cards.id, cardId))
      .returning();
    if (!cardRow) throw new Error('card suspend returned no row');
    const [versionRow] = await db
      .select()
      .from(cardVersions)
      .where(and(eq(cardVersions.cardId, cardId), eq(cardVersions.version, cardRow.currentVersion)))
      .limit(1);
    if (!versionRow) throw new Error('card version missing for suspended card');
    return toCard(cardRow, versionRow);
  },

  saveReport: async (cardId, studentId, version, input) => {
    await db.insert(cardReports).values({
      cardId,
      studentId,
      version,
      reason: input.reason,
      comment: input.comment ?? null,
    });
  },
});
