import { z } from 'zod';

export const leagueTier = z.enum(['bronze', 'prata', 'ouro', 'diamante']);

export const sessionToday = z.object({
  completed: z.number().int().nonnegative(),
  goal: z.number().int().positive(),
  streak: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
});

export const badge = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tier: z.enum(['ouro', 'prata', 'bronze']),
});

export const profile = z.object({
  name: z.string(),
  handle: z.string(),
  headline: z.string(),
  levelLabel: z.string(),
  leagueLabel: z.string(),
  retentionPercent: z.number().min(0).max(100),
  retentionTarget: z.number().min(0).max(100),
  stabilizedFacts: z.number().int().nonnegative(),
  cardsReviewed: z.number().int().nonnegative(),
  activeDaysLast30: z.number().int().min(0).max(30),
  dailyGoal: z.number().int().positive(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/),
  badges: z.array(badge),
});

export const rankingEntry = z.object({
  id: z.string().uuid(),
  position: z.number().int().positive(),
  name: z.string(),
  headline: z.string(),
  xp: z.number().int().nonnegative(),
  trend: z.enum(['subindo', 'estavel', 'caindo']),
  isCurrentUser: z.boolean(),
});

export const ranking = z.object({
  leagueName: z.string(),
  leagueRankLabel: z.string(),
  endsInLabel: z.string(),
  promotionCutoff: z.number().int().positive(),
  relegationCutoff: z.number().int().positive(),
  podium: z.array(rankingEntry).max(3),
  entries: z.array(rankingEntry),
  duel: z.object({
    title: z.string(),
    description: z.string(),
    rewardLabel: z.string(),
  }),
});

export const updateGoalBody = z.object({
  dailyGoal: z.number().int().min(1).max(200).optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export type LeagueTier = z.infer<typeof leagueTier>;
export type SessionToday = z.infer<typeof sessionToday>;
export type Profile = z.infer<typeof profile>;
export type Ranking = z.infer<typeof ranking>;
export type RankingEntry = z.infer<typeof rankingEntry>;
export type UpdateGoalBody = z.infer<typeof updateGoalBody>;
