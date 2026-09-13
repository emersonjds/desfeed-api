import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { emptyState, schedule } from './fsrs.js';
import type { DueCard, SchedulingRepository, ReviewRecord } from './scheduling.repository.js';
import { createSchedulingService } from './scheduling.service.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const cardId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-09-13T12:00:00.000Z');

const makeCard = (overrides: Partial<DueCard> = {}): DueCard => ({
  id: cardId,
  subject: 'Física II',
  chapter: 'Termodinâmica',
  imageUrl: '',
  question: 'Qual o rendimento máximo teórico de uma máquina de Carnot?',
  keyTerm: 'Ciclo de Carnot',
  highlightTerm: 'rendimento máximo',
  options: [
    { id: 'A', label: 'n = 1 - T2/T1' },
    { id: 'B', label: 'n = T1 + T2' },
    { id: 'C', label: 'n = Q1 / Q2' },
    { id: 'D', label: 'n = 0' },
  ],
  correctOptionId: 'A',
  version: 1,
  ...overrides,
});

const makeRepository = (overrides: Partial<SchedulingRepository> = {}): SchedulingRepository => ({
  findPreferences: async () => ({
    timezone: 'America/Sao_Paulo',
    dailyGoal: 20,
    newCardsPerDay: 10,
  }),
  listDue: async () => [],
  listNew: async () => [],
  countNewIntroduced: async () => 0,
  findCard: async () => makeCard(),
  findReview: async () => undefined,
  saveReview: async () => undefined,
  ...overrides,
});

describe('scheduling service', () => {
  it('recusa fila de aluno inexistente', async () => {
    const service = createSchedulingService(makeRepository({ findPreferences: async () => undefined }));
    await expect(service.getQueue(studentId, now)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('devolve os cards devidos antes dos novos', async () => {
    const service = createSchedulingService(
      makeRepository({
        listDue: async () => [makeCard({ id: cardId, state: emptyState(now) })],
        listNew: async () => [makeCard({ id: '66666666-6666-4666-8666-666666666666' })],
      }),
    );
    const queue = await service.getQueue(studentId, now);
    expect(queue.cards.map((card) => card.id)).toEqual([
      cardId,
      '66666666-6666-4666-8666-666666666666',
    ]);
  });

  it('respeita o teto de cards novos por dia', async () => {
    const requested: number[] = [];
    const service = createSchedulingService(
      makeRepository({
        countNewIntroduced: async () => 7,
        listNew: async (_studentId, limit) => {
          requested.push(limit);
          return [];
        },
      }),
    );
    await service.getQueue(studentId, now);
    expect(requested).toEqual([3]);
  });

  it('não pede card novo quando o teto do dia já foi atingido', async () => {
    let asked = false;
    const service = createSchedulingService(
      makeRepository({
        countNewIntroduced: async () => 10,
        listNew: async () => {
          asked = true;
          return [];
        },
      }),
    );
    const queue = await service.getQueue(studentId, now);
    expect(asked).toBe(false);
    expect(queue.cards).toEqual([]);
  });

  it('card novo aparece com domínio zerado e sem revisões', async () => {
    const service = createSchedulingService(
      makeRepository({ listNew: async () => [makeCard()] }),
    );
    const [card] = (await service.getQueue(studentId, now)).cards;
    expect(card?.masteryPercent).toBe(0);
    expect(card?.reviewNumber).toBe(0);
    expect(card?.fsrs.state).toBe(State.New);
  });

  it('avança o estado do card conforme o grau informado', async () => {
    const saved: ReviewRecord[] = [];
    const service = createSchedulingService(
      makeRepository({
        saveReview: async (record) => {
          saved.push(record);
        },
      }),
    );
    const result = await service.submitReview(studentId, {
      cardId,
      rating: 'good',
      reviewedAt: now.toISOString(),
      origin: 'feed',
    });
    expect(new Date(result.nextDue).getTime()).toBeGreaterThan(now.getTime());
    expect(saved[0]?.previousState).toBe(State.New);
    expect(saved[0]?.next.reps).toBe(1);
  });

  it('errar devolve o card para antes do intervalo de acerto', async () => {
    const learned = schedule(emptyState(now), 'good', now).card;
    const good = schedule(learned, 'good', now).card;
    const again = schedule(learned, 'again', now).card;
    expect(again.due.getTime()).toBeLessThan(good.due.getTime());
    expect(again.state).toBe(State.Learning);
    expect(again.stability).toBeLessThan(good.stability);
  });

  it('card esquecido em revisão vira relearning e conta lapso', () => {
    const review = { ...emptyState(now), state: State.Review, stability: 10, difficulty: 5, reps: 4 };
    const forgotten = schedule(review, 'again', now).card;
    expect(forgotten.state).toBe(State.Relearning);
    expect(forgotten.lapses).toBe(1);
  });

  it('card em revisão ganha intervalo maior no grau fácil que no difícil', async () => {
    const review = { ...emptyState(now), state: State.Review, stability: 10, difficulty: 5, reps: 4 };
    const hard = schedule(review, 'hard', now).card;
    const easy = schedule(review, 'easy', now).card;
    expect(easy.due.getTime()).toBeGreaterThan(hard.due.getTime());
  });

  it('registra a origem da revisão', async () => {
    const saved: ReviewRecord[] = [];
    const service = createSchedulingService(
      makeRepository({
        saveReview: async (record) => {
          saved.push(record);
        },
      }),
    );
    await service.submitReview(studentId, {
      cardId,
      rating: 'easy',
      reviewedAt: now.toISOString(),
      origin: 'sala',
    });
    expect(saved[0]?.origin).toBe('sala');
  });

  it('revisão reenviada devolve o resultado gravado, sem reagendar', async () => {
    let saves = 0;
    const service = createSchedulingService(
      makeRepository({
        findReview: async () => ({ nextDue: new Date('2026-09-20T12:00:00.000Z'), xpGained: 15 }),
        saveReview: async () => {
          saves += 1;
        },
      }),
    );
    const result = await service.submitReview(studentId, {
      cardId,
      rating: 'good',
      reviewedAt: now.toISOString(),
      origin: 'feed',
    });
    expect(result).toEqual({ nextDue: '2026-09-20T12:00:00.000Z', xpGained: 15 });
    expect(saves).toBe(0);
  });

  it('recusa revisão de card fora da fila do aluno', async () => {
    const service = createSchedulingService(makeRepository({ findCard: async () => undefined }));
    await expect(
      service.submitReview(studentId, {
        cardId,
        rating: 'good',
        reviewedAt: now.toISOString(),
        origin: 'feed',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('paga mais XP por acerto difícil que por acerto fácil', () => {
    expect(schedule(emptyState(now), 'hard', now).xpGained).toBeGreaterThan(
      schedule(emptyState(now), 'easy', now).xpGained,
    );
  });
});
