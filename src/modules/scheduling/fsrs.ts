import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { CardFsrs, Rating as ReviewRating } from './scheduling.schemas.js';

const scheduler = fsrs();

const ratingValue: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// XP paga esforço de recuperação, nunca tempo de tela: acertar difícil vale mais que acertar fácil.
const xpByRating: Record<ReviewRating, number> = { again: 5, hard: 20, good: 15, easy: 10 };

export interface ScheduledReview {
  card: FsrsCard;
  xpGained: number;
}

export const emptyState = (createdAt: Date): FsrsCard => createEmptyCard(createdAt);

export const schedule = (
  current: FsrsCard,
  reviewRating: ReviewRating,
  reviewedAt: Date,
): ScheduledReview => ({
  card: scheduler.next(current, reviewedAt, ratingValue[reviewRating]).card,
  xpGained: xpByRating[reviewRating],
});

export const retrievabilityPercent = (current: FsrsCard, at: Date): number =>
  Math.round(scheduler.get_retrievability(current, at, false) * 100);

export const toContract = (current: FsrsCard): CardFsrs => ({
  due: current.due.toISOString(),
  stability: current.stability,
  difficulty: current.difficulty,
  elapsed_days: current.elapsed_days,
  scheduled_days: current.scheduled_days,
  learning_steps: current.learning_steps,
  reps: current.reps,
  lapses: current.lapses,
  state: current.state as CardFsrs['state'],
  ...(current.last_review ? { last_review: current.last_review.toISOString() } : {}),
});
