import { and, asc, count, eq, isNotNull, or, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cards, notebooks, themes } from '../../db/schema.js';
import type {
  CreateNotebookBody,
  NotebookDetail,
  NotebookSummary,
  ThemeSummary,
} from './catalog.schemas.js';

export interface NotebookRepository {
  findByStudentAndTitle: (studentId: string, title: string) => Promise<NotebookSummary | undefined>;
  listByStudent: (studentId: string) => Promise<NotebookSummary[]>;
  findById: (studentId: string, notebookId: string) => Promise<NotebookDetail | undefined>;
  create: (studentId: string, input: CreateNotebookBody) => Promise<NotebookSummary>;
}

type NotebookRow = typeof notebooks.$inferSelect;

const toSummary = (row: NotebookRow, cardCount: number): NotebookSummary => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  coverUrl: row.coverUrl,
  sourceLabel: row.sourceLabel,
  cardCount,
  status: null,
  retentionPercent: null,
  nextReviewLabel: null,
});

// O caderno da aula pertence ao professor, não ao aluno: ele aparece para a turma inteira.
const visibleTo = (studentId: string) =>
  or(
    eq(notebooks.studentId, studentId),
    and(isNotNull(notebooks.teacherId), isNull(notebooks.studentId)),
  );

const withApprovedCardCount = (db: Database) =>
  db
    .select({ notebook: notebooks, cardCount: count(cards.id) })
    .from(notebooks)
    .leftJoin(themes, eq(themes.notebookId, notebooks.id))
    .leftJoin(cards, and(eq(cards.themeId, themes.id), eq(cards.status, 'approved')))
    .groupBy(notebooks.id);

export const createNotebookRepository = (db: Database): NotebookRepository => ({
  findByStudentAndTitle: async (studentId, title) => {
    const [row] = await withApprovedCardCount(db)
      .where(and(visibleTo(studentId), eq(notebooks.title, title)))
      .limit(1);
    return row ? toSummary(row.notebook, row.cardCount) : undefined;
  },

  listByStudent: async (studentId) => {
    const rows = await withApprovedCardCount(db)
      .where(visibleTo(studentId))
      .orderBy(asc(notebooks.title));
    return rows.map((row) => toSummary(row.notebook, row.cardCount));
  },

  findById: async (studentId, notebookId) => {
    const [row] = await withApprovedCardCount(db)
      .where(and(visibleTo(studentId), eq(notebooks.id, notebookId)))
      .limit(1);
    if (!row) return undefined;

    const themeRows = await db
      .select({
        id: themes.id,
        title: themes.title,
        cardCount: count(cards.id),
      })
      .from(themes)
      .leftJoin(cards, and(eq(cards.themeId, themes.id), eq(cards.status, 'approved')))
      .where(eq(themes.notebookId, notebookId))
      .groupBy(themes.id, themes.title)
      .orderBy(asc(themes.title));

    const themeSummaries: ThemeSummary[] = themeRows.map((theme) => ({
      id: theme.id,
      title: theme.title,
      cardCount: theme.cardCount,
    }));

    return {
      ...toSummary(row.notebook, row.cardCount),
      createdAt: row.notebook.createdAt.toISOString(),
      themes: themeSummaries,
    };
  },

  create: async (studentId, input) => {
    const [row] = await db
      .insert(notebooks)
      .values({
        studentId,
        title: input.title,
        subject: input.subject ?? null,
        coverUrl: input.coverUrl ?? null,
        ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      })
      .returning();
    if (!row) throw new Error('notebook insert returned no row');
    return toSummary(row, 0);
  },
});
