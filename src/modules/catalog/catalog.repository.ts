import { and, asc, count, eq, isNotNull, or, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cards, notebooks, themes } from '../../db/schema.js';
import type {
  CreateNotebookBody,
  NotebookDetail,
  NotebookSummary,
  ThemeSummary,
} from './catalog.schemas.js';

export interface LibraryTotals {
  globalRetentionPercent: number | null;
  consolidatedConcepts: number;
  stabilityDays: number | null;
}

export interface NotebookScheduling {
  notebookId: string;
  status: 'revisao-hoje' | 'estavel' | 'reforco';
  retentionPercent: number;
  nextReviewLabel: string;
  coverUrl: string | null;
}

export interface ForgettingPeakRow {
  id: string;
  title: string;
  whenLabel: string;
  urgency: 'alta' | 'media' | 'baixa';
  cardCount: number;
  detail: string;
}

export interface NotebookRepository {
  loadTotals: (studentId: string) => Promise<LibraryTotals>;
  loadScheduling: (studentId: string) => Promise<NotebookScheduling[]>;
  loadPeaks: (studentId: string) => Promise<ForgettingPeakRow[]>;
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


const dueLabel = (days: number): string => {
  if (days <= 0) return 'Revisar hoje';
  if (days === 1) return 'Revisa amanhã';
  return `Revisa em ${days} dias`;
};

const urgencyOf = (days: number): 'alta' | 'media' | 'baixa' => {
  if (days <= 1) return 'alta';
  if (days <= 3) return 'media';
  return 'baixa';
};

export const createNotebookRepository = (db: Database): NotebookRepository => ({
  loadTotals: async (studentId) => {
    const [row] = (
      await db.execute(sql`
        select
          (
            select round(100.0 * count(*) filter (where rating <> 'again') / nullif(count(*), 0))
            from review_logs
            where student_id = ${studentId} and reviewed_at >= now() - interval '30 days'
          ) as retention,
          count(*) filter (where card_states.stability >= 14)::int as consolidated,
          round(avg(card_states.stability)::numeric, 1) as stability
        from card_states
        where card_states.student_id = ${studentId}
      `)
    ).rows as { retention: number | null; consolidated: number; stability: number | null }[];

    return {
      globalRetentionPercent: row?.retention === null ? null : Number(row?.retention ?? 0),
      consolidatedConcepts: Number(row?.consolidated ?? 0),
      stabilityDays: row?.stability === null ? null : Number(row?.stability ?? 0),
    };
  },

  loadScheduling: async (studentId) => {
    const rows = (
      await db.execute(sql`
        select
          notebooks.id as notebook_id,
          round(avg(card_states.stability)::numeric, 1) as stability,
          min(card_states.due) as next_due,
          round(100.0 * count(card_states.card_id) filter (where card_states.stability >= 7)
            / nullif(count(card_states.card_id), 0)) as retention,
          (
            select card_versions.image_url
            from cards
            join card_versions on card_versions.card_id = cards.id
             and card_versions.version = cards.current_version
            join themes as t on t.id = cards.theme_id
            where t.notebook_id = notebooks.id and card_versions.image_url is not null
            limit 1
          ) as cover_url
        from notebooks
        left join themes on themes.notebook_id = notebooks.id
        left join cards on cards.theme_id = themes.id and cards.status = 'approved'
        left join card_states on card_states.card_id = cards.id
         and card_states.student_id = ${studentId}
        where notebooks.student_id = ${studentId}
           or (notebooks.teacher_id is not null and notebooks.student_id is null)
        group by notebooks.id
      `)
    ).rows as unknown as {
      notebook_id: string;
      stability: number | null;
      next_due: string | null;
      retention: number | null;
      cover_url: string | null;
    }[];

    return rows.map((row) => {
      const stability = row.stability === null ? 0 : Number(row.stability);
      const days = row.next_due
        ? Math.ceil((new Date(row.next_due).getTime() - Date.now()) / 86_400_000)
        : 7;

      return {
        notebookId: row.notebook_id,
        status: days <= 0 ? 'revisao-hoje' : stability < 7 ? 'reforco' : 'estavel',
        retentionPercent: Number(row.retention ?? 0),
        nextReviewLabel: dueLabel(days),
        coverUrl: row.cover_url,
      };
    });
  },

  loadPeaks: async (studentId) => {
    const rows = (
      await db.execute(sql`
        select
          themes.id,
          themes.title,
          count(card_states.card_id)::int as card_count,
          min(card_states.due) as next_due,
          coalesce(notebooks.subject, notebooks.title) as subject
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        join card_states on card_states.card_id = cards.id
         and card_states.student_id = ${studentId}
        where card_states.due <= now() + interval '4 days'
        group by themes.id, themes.title, 5
        order by min(card_states.due) asc
        limit 4
      `)
    ).rows as unknown as {
      id: string;
      title: string;
      card_count: number;
      next_due: string;
      subject: string;
    }[];

    return rows.map((row) => {
      const days = Math.max(
        Math.ceil((new Date(row.next_due).getTime() - Date.now()) / 86_400_000),
        0,
      );

      return {
        id: row.id,
        title: row.title,
        whenLabel: dueLabel(days),
        urgency: urgencyOf(days),
        cardCount: Number(row.card_count),
        detail: `${row.subject} · ${row.card_count} conceitos prestes a serem esquecidos`,
      };
    });
  },

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
