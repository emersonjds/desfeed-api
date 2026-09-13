import { notFound } from '../../shared/http/errors.js';
import { startOfDayIn } from '../../shared/time/timezone.js';
import { emptyState, retrievabilityPercent, schedule, toContract } from './fsrs.js';
import type { DueCard, SchedulingRepository } from './scheduling.repository.js';
import type { QueueCard, SubmitReviewBody, SubmitReviewResponse } from './scheduling.schemas.js';

export interface SchedulingService {
  getQueue: (studentId: string, now: Date) => Promise<{ cards: QueueCard[] }>;
  submitReview: (studentId: string, body: SubmitReviewBody) => Promise<SubmitReviewResponse>;
}

const QUEUE_LIMIT = 60;

const toQueueCard = (card: DueCard, now: Date): QueueCard => {
  const state = card.state ?? emptyState(now);
  return {
    id: card.id,
    subject: card.subject,
    chapter: card.chapter,
    imageUrl: card.imageUrl,
    question: card.question,
    keyTerm: card.keyTerm,
    highlightTerm: card.highlightTerm,
    options: card.options,
    correctOptionId: card.correctOptionId,
    reviewNumber: state.reps,
    masteryPercent: card.state ? retrievabilityPercent(state, now) : 0,
    bookmarkCount: 0,
    shareCount: 0,
    fsrs: toContract(state),
  };
};

export const createSchedulingService = (
  repository: SchedulingRepository,
): SchedulingService => ({
  getQueue: async (studentId, now) => {
    const preferences = await repository.findPreferences(studentId);
    if (!preferences) throw notFound('Aluno não encontrado.');

    const due = await repository.listDue(studentId, now, QUEUE_LIMIT);
    const introduced = await repository.countNewIntroduced(
      studentId,
      startOfDayIn(now, preferences.timezone),
    );
    const remainingNew = Math.max(preferences.newCardsPerDay - introduced, 0);
    const fresh = remainingNew > 0 ? await repository.listNew(studentId, remainingNew) : [];

    return { cards: [...due, ...fresh].map((card) => toQueueCard(card, now)) };
  },

  submitReview: async (studentId, body) => {
    const reviewedAt = new Date(body.reviewedAt);
    const alreadyRecorded = await repository.findReview(studentId, body.cardId, reviewedAt);
    if (alreadyRecorded) {
      return {
        nextDue: alreadyRecorded.nextDue.toISOString(),
        xpGained: alreadyRecorded.xpGained,
      };
    }

    const card = await repository.findCard(studentId, body.cardId);
    if (!card) throw notFound('Card não encontrado na fila deste aluno.');

    const current = card.state ?? emptyState(reviewedAt);
    const { card: next, xpGained } = schedule(current, body.rating, reviewedAt);

    await repository.saveReview({
      studentId,
      cardId: card.id,
      cardVersion: card.version,
      rating: body.rating,
      origin: body.origin,
      reviewedAt,
      previousState: current.state,
      previousDue: current.due,
      xpGained,
      next,
    });

    return { nextDue: next.due.toISOString(), xpGained };
  },
});
