import { and, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cardStates, dailyProgress, reviewLogs, studentLeagues, students } from '../../db/schema.js';
import type { LeagueTier } from './gamification.schemas.js';

export interface StudentProfileRow {
  id: string;
  displayName: string;
  timezone: string;
  dailyGoal: number;
  reminderTime: string;
}

export interface DayProgress {
  day: string;
  reviews: number;
  xp: number;
  goal: number;
  metGoal: boolean;
}

export interface LeagueMember {
  studentId: string;
  displayName: string;
  xp: number;
  previousXp: number;
}

export interface MemoryTotals {
  cardsReviewed: number;
  stabilizedFacts: number;
  averageRetentionPercent: number | null;
}

export interface GamificationRepository {
  findStudent: (studentId: string) => Promise<StudentProfileRow | undefined>;
  findDay: (studentId: string, day: string) => Promise<DayProgress | undefined>;
  listDays: (studentId: string, since: string) => Promise<DayProgress[]>;
  totalXp: (studentId: string) => Promise<number>;
  memoryTotals: (studentId: string) => Promise<MemoryTotals>;
  findLeague: (studentId: string) => Promise<{ tier: LeagueTier; settledWeek: string | null }>;
  listLeagueMembers: (
    tier: LeagueTier,
    weekDays: string[],
    previousWeekDays: string[],
  ) => Promise<LeagueMember[]>;
  saveLeague: (studentId: string, tier: LeagueTier, settledWeek: string) => Promise<void>;
  updatePreferences: (
    studentId: string,
    changes: { dailyGoal?: number | undefined; reminderTime?: string | undefined },
  ) => Promise<void>;
}

const toNumber = (value: string | number | null): number => Number(value ?? 0);

export const createGamificationRepository = (db: Database): GamificationRepository => ({
  findStudent: async (studentId) => {
    const [row] = await db
      .select({
        id: students.id,
        displayName: students.displayName,
        timezone: students.timezone,
        dailyGoal: students.dailyGoal,
        reminderTime: students.reminderTime,
      })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    return row;
  },

  findDay: async (studentId, day) => {
    const [row] = await db
      .select()
      .from(dailyProgress)
      .where(and(eq(dailyProgress.studentId, studentId), eq(dailyProgress.day, day)))
      .limit(1);
    return row;
  },

  listDays: async (studentId, since) =>
    db
      .select()
      .from(dailyProgress)
      .where(and(eq(dailyProgress.studentId, studentId), gte(dailyProgress.day, since)))
      .orderBy(desc(dailyProgress.day)),

  totalXp: async (studentId) => {
    const [row] = await db
      .select({ total: sum(dailyProgress.xp) })
      .from(dailyProgress)
      .where(eq(dailyProgress.studentId, studentId));
    return toNumber(row?.total ?? 0);
  },

  memoryTotals: async (studentId) => {
    const [reviewed] = await db
      .select({ total: count() })
      .from(reviewLogs)
      .where(eq(reviewLogs.studentId, studentId));

    const states = await db
      .select({ stability: cardStates.stability, state: cardStates.state })
      .from(cardStates)
      .where(eq(cardStates.studentId, studentId));

    const stabilizedFacts = states.filter(
      (item) => item.state === 2 && item.stability >= 21,
    ).length;

    const averageRetentionPercent = states.length
      ? Math.round(
          (states.reduce((total, item) => total + Math.min(item.stability / 21, 1), 0) /
            states.length) *
            100,
        )
      : null;

    return {
      cardsReviewed: reviewed?.total ?? 0,
      stabilizedFacts,
      averageRetentionPercent,
    };
  },

  findLeague: async (studentId) => {
    const [row] = await db
      .select({ tier: studentLeagues.tier, settledWeek: studentLeagues.settledWeek })
      .from(studentLeagues)
      .where(eq(studentLeagues.studentId, studentId))
      .limit(1);
    return row ?? { tier: 'bronze', settledWeek: null };
  },

  listLeagueMembers: async (tier, weekDays, previousWeekDays) => {
    // Aluno sem linha em student_leagues ainda é bronze.
    const relevant = await db
      .select({ studentId: students.id, displayName: students.displayName })
      .from(students)
      .leftJoin(studentLeagues, eq(studentLeagues.studentId, students.id))
      .where(eq(sql`coalesce(${studentLeagues.tier}, 'bronze')`, tier));

    const ids = relevant.map((member) => member.studentId);
    if (ids.length === 0) return [];

    const progress = await db
      .select({
        studentId: dailyProgress.studentId,
        day: dailyProgress.day,
        xp: dailyProgress.xp,
      })
      .from(dailyProgress)
      .where(
        and(
          inArray(dailyProgress.studentId, ids),
          inArray(dailyProgress.day, [...weekDays, ...previousWeekDays]),
        ),
      );

    return relevant.map((member) => {
      const rows = progress.filter((row) => row.studentId === member.studentId);
      const sumFor = (days: string[]): number =>
        rows.filter((row) => days.includes(row.day)).reduce((total, row) => total + row.xp, 0);
      return {
        studentId: member.studentId,
        displayName: member.displayName,
        xp: sumFor(weekDays),
        previousXp: sumFor(previousWeekDays),
      };
    });
  },

  saveLeague: async (studentId, tier, settledWeek) => {
    await db
      .insert(studentLeagues)
      .values({ studentId, tier, settledWeek })
      .onConflictDoUpdate({
        target: studentLeagues.studentId,
        set: { tier, settledWeek, updatedAt: new Date() },
      });
  },

  updatePreferences: async (studentId, changes) => {
    await db
      .update(students)
      .set({
        ...(changes.dailyGoal ? { dailyGoal: changes.dailyGoal } : {}),
        ...(changes.reminderTime ? { reminderTime: changes.reminderTime } : {}),
      })
      .where(eq(students.id, studentId));
  },
});
