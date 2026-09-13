import { and, asc, count, eq, gte, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Database } from '../../db/client.js';
import {
  cardStates,
  cardVersions,
  cards,
  dailyProgress,
  notebooks,
  reviewLogs,
  students,
  teachers,
  themes,
} from '../../db/schema.js';
import type { Rating } from './scheduling.schemas.js';

export interface DueCard {
  id: string;
  subject: string;
  chapter: string;
  imageUrl: string;
  question: string;
  keyTerm: string;
  highlightTerm: string;
  options: { id: 'A' | 'B' | 'C' | 'D'; label: string }[];
  correctOptionId: 'A' | 'B' | 'C' | 'D';
  version: number;
  teacherName: string | null;
  state?: FsrsCard;
}

export interface StudentPreferences {
  timezone: string;
  dailyGoal: number;
  newCardsPerDay: number;
}

export interface ReviewRecord {
  studentId: string;
  day: string;
  dailyGoal: number;
  cardId: string;
  cardVersion: number;
  rating: Rating;
  origin: 'feed' | 'sala';
  reviewedAt: Date;
  previousState: number;
  previousDue: Date;
  xpGained: number;
  next: FsrsCard;
}

export interface SchedulingRepository {
  findPreferences: (studentId: string) => Promise<StudentPreferences | undefined>;
  listDue: (studentId: string, now: Date, limit: number) => Promise<DueCard[]>;
  listNew: (studentId: string, limit: number) => Promise<DueCard[]>;
  countNewIntroduced: (studentId: string, since: Date) => Promise<number>;
  findCard: (studentId: string, cardId: string) => Promise<DueCard | undefined>;
  findReview: (
    studentId: string,
    cardId: string,
    reviewedAt: Date,
  ) => Promise<{ nextDue: Date; xpGained: number } | undefined>;
  saveReview: (record: ReviewRecord) => Promise<void>;
}

const cardColumns = {
  id: cards.id,
  subject: sql<string>`coalesce(${notebooks.subject}, ${notebooks.title})`,
  chapter: themes.title,
  imageUrl: sql<string>`coalesce(${cardVersions.imageUrl}, '')`,
  question: cardVersions.question,
  keyTerm: cardVersions.keyTerm,
  highlightTerm: cardVersions.highlightTerm,
  options: cardVersions.options,
  correctOptionId: cardVersions.correctOptionId,
  version: cardVersions.version,
  teacherName: teachers.displayName,
};

// Caderno do professor sem aluno é da turma inteira; com aluno preenchido é reforço dirigido
// e só aquele aluno enxerga. Sem a segunda metade, o reforço individual vaza para todo mundo.
const visibleTo = (studentId: string) =>
  or(
    eq(notebooks.studentId, studentId),
    and(isNotNull(notebooks.teacherId), isNull(notebooks.studentId)),
  );

const approvedCardsOf = (db: Database, studentId: string, extra?: SQL) =>
  db
    .select({ ...cardColumns, state: cardStates })
    .from(cards)
    .innerJoin(
      cardVersions,
      and(eq(cardVersions.cardId, cards.id), eq(cardVersions.version, cards.currentVersion)),
    )
    .innerJoin(themes, eq(themes.id, cards.themeId))
    .innerJoin(notebooks, eq(notebooks.id, themes.notebookId))
    .leftJoin(teachers, eq(teachers.id, notebooks.teacherId))
    .leftJoin(
      cardStates,
      and(eq(cardStates.cardId, cards.id), eq(cardStates.studentId, studentId)),
    )
    .where(
      and(
        visibleTo(studentId),
        eq(cards.status, 'approved'),
        extra,
      ),
    );

type StateRow = typeof cardStates.$inferSelect;

const toFsrsCard = (row: StateRow): FsrsCard => ({
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  elapsed_days: row.elapsedDays,
  scheduled_days: row.scheduledDays,
  learning_steps: row.learningSteps,
  reps: row.reps,
  lapses: row.lapses,
  state: row.state,
  ...(row.lastReview ? { last_review: row.lastReview } : {}),
});

type CardRow = Omit<DueCard, 'state' | 'options' | 'correctOptionId'> & {
  options: DueCard['options'];
  correctOptionId: string;
  state: StateRow | null;
};

const toDueCard = (row: CardRow): DueCard => ({
  id: row.id,
  subject: row.subject,
  chapter: row.chapter,
  imageUrl: row.imageUrl,
  question: row.question,
  keyTerm: row.keyTerm,
  highlightTerm: row.highlightTerm,
  options: row.options,
  correctOptionId: row.correctOptionId as DueCard['correctOptionId'],
  version: row.version,
  teacherName: row.teacherName,
  ...(row.state ? { state: toFsrsCard(row.state) } : {}),
});

export const createSchedulingRepository = (db: Database): SchedulingRepository => ({
  findPreferences: async (studentId) => {
    const [row] = await db
      .select({
        timezone: students.timezone,
        dailyGoal: students.dailyGoal,
        newCardsPerDay: students.newCardsPerDay,
      })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    return row;
  },

  listDue: async (studentId, now, limit) => {
    const rows = await approvedCardsOf(db, studentId, lte(cardStates.due, now))
      .orderBy(asc(cardStates.due))
      .limit(limit);
    return rows.map(toDueCard);
  },

  listNew: async (studentId, limit) => {
    const rows = await approvedCardsOf(db, studentId, isNull(cardStates.cardId))
      .orderBy(asc(cards.createdAt))
      .limit(limit);
    return rows.map(toDueCard);
  },

  countNewIntroduced: async (studentId, since) => {
    const [row] = await db
      .select({ total: count() })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.studentId, studentId),
          eq(reviewLogs.previousState, 0),
          gte(reviewLogs.reviewedAt, since),
        ),
      );
    return row?.total ?? 0;
  },

  findCard: async (studentId, cardId) => {
    const rows = await approvedCardsOf(db, studentId, eq(cards.id, cardId)).limit(1);
    const [row] = rows;
    return row ? toDueCard(row) : undefined;
  },

  findReview: async (studentId, cardId, reviewedAt) => {
    const [row] = await db
      .select({ nextDue: reviewLogs.nextDue, xpGained: reviewLogs.xpGained })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.studentId, studentId),
          eq(reviewLogs.cardId, cardId),
          eq(reviewLogs.reviewedAt, reviewedAt),
        ),
      )
      .limit(1);
    return row;
  },

  saveReview: async (record) => {
    await db.transaction(async (tx) => {
      await tx.insert(reviewLogs).values({
        studentId: record.studentId,
        cardId: record.cardId,
        cardVersion: record.cardVersion,
        rating: record.rating,
        origin: record.origin,
        reviewedAt: record.reviewedAt,
        previousState: record.previousState,
        previousDue: record.previousDue,
        nextDue: record.next.due,
        elapsedDays: record.next.elapsed_days,
        scheduledDays: record.next.scheduled_days,
        xpGained: record.xpGained,
      });

      await tx
        .insert(dailyProgress)
        .values({
          studentId: record.studentId,
          day: record.day,
          reviews: 1,
          xp: record.xpGained,
          goal: record.dailyGoal,
          metGoal: record.dailyGoal <= 1,
        })
        .onConflictDoUpdate({
          target: [dailyProgress.studentId, dailyProgress.day],
          set: {
            reviews: sql`${dailyProgress.reviews} + 1`,
            xp: sql`${dailyProgress.xp} + ${record.xpGained}`,
            metGoal: sql`${dailyProgress.reviews} + 1 >= ${dailyProgress.goal}`,
            updatedAt: new Date(),
          },
        });

      await tx
        .insert(cardStates)
        .values({
          studentId: record.studentId,
          cardId: record.cardId,
          due: record.next.due,
          stability: record.next.stability,
          difficulty: record.next.difficulty,
          elapsedDays: record.next.elapsed_days,
          scheduledDays: record.next.scheduled_days,
          learningSteps: record.next.learning_steps,
          reps: record.next.reps,
          lapses: record.next.lapses,
          state: record.next.state,
          lastReview: record.next.last_review ?? null,
        })
        .onConflictDoUpdate({
          target: [cardStates.studentId, cardStates.cardId],
          set: {
            due: record.next.due,
            stability: record.next.stability,
            difficulty: record.next.difficulty,
            elapsedDays: record.next.elapsed_days,
            scheduledDays: record.next.scheduled_days,
            learningSteps: record.next.learning_steps,
            reps: record.next.reps,
            lapses: record.next.lapses,
            state: record.next.state,
            lastReview: record.next.last_review ?? null,
          },
        });
    });
  },
});
