import { z } from 'zod';
import { cardContent } from '../catalog/cards.schemas.js';

export const rating = z.enum(['again', 'hard', 'good', 'easy']);

export const fsrsState = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const cardFsrs = z.object({
  due: z.string().datetime(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: fsrsState,
  last_review: z.string().datetime().optional(),
});

export const cardOrigin = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turma'), teacher: z.string(), lesson: z.string() }),
  z.object({ kind: z.literal('proprio'), theme: z.string() }),
]);

export const queueCard = cardContent.omit({ imageUrl: true }).extend({
  id: z.string().uuid(),
  origin: cardOrigin,
  subject: z.string(),
  chapter: z.string(),
  imageUrl: z.string(),
  reviewNumber: z.number().int().nonnegative(),
  masteryPercent: z.number().min(0).max(100),
  bookmarkCount: z.number().int().nonnegative(),
  shareCount: z.number().int().nonnegative(),
  fsrs: cardFsrs,
});

export const queueTodayResponse = z.object({
  cards: z.array(queueCard),
});

export const submitReviewBody = z.object({
  cardId: z.string().uuid(),
  rating,
  reviewedAt: z.string().datetime(),
  origin: z.enum(['feed', 'sala']).default('feed'),
});

export const submitReviewResponse = z.object({
  nextDue: z.string().datetime(),
  xpGained: z.number().int().nonnegative(),
});

export type Rating = z.infer<typeof rating>;
export type CardFsrs = z.infer<typeof cardFsrs>;
export type CardOrigin = z.infer<typeof cardOrigin>;
export type QueueCard = z.infer<typeof queueCard>;
export type SubmitReviewBody = z.infer<typeof submitReviewBody>;
export type SubmitReviewResponse = z.infer<typeof submitReviewResponse>;
