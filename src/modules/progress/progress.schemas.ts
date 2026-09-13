import { z } from 'zod';

export const subjectProgress = z.object({
  subject: z.string(),
  retention: z.number().min(0).max(100),
  delta: z.number(),
  consolidated: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});

export const conceptAtRisk = z.object({
  concept: z.string(),
  subject: z.string(),
  daysUntilForgotten: z.number().int(),
});

export const progressResponse = z.object({
  streakDays: z.number().int().nonnegative(),
  freezesLeft: z.number().int().nonnegative(),
  retentionD7: z.number().min(0).max(100),
  retentionD7LastMonth: z.number().min(0).max(100),
  consolidated: z.number().int().nonnegative(),
  totalConcepts: z.number().int().positive(),
  weekMinutes: z
    .array(z.object({ day: z.string(), minutes: z.number().int().nonnegative() }))
    .length(7),
  subjects: z.array(subjectProgress),
  atRisk: z.array(conceptAtRisk),
  classGoal: z.object({
    className: z.string(),
    label: z.string(),
    done: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
});

export type ProgressResponse = z.infer<typeof progressResponse>;
