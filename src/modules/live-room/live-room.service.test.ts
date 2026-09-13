import { describe, expect, it } from 'vitest';
import type { AnswerRow, LiveRoomRepository, RoomRow } from './live-room.repository.js';
import { createLiveRoomService, type AnsweredEvent } from './live-room.service.js';
import { generatePin } from './pin.js';

const teacherId = '44444444-4444-4444-8444-444444444444';
const otherTeacherId = '77777777-7777-4777-8777-777777777777';
const roomId = '88888888-8888-4888-8888-888888888888';
const participantId = '99999999-9999-4999-8999-999999999999';
const firstCard = '11111111-1111-4111-8111-111111111111';
const secondCard = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-09-13T12:00:00.000Z');

const makeRoom = (overrides: Partial<RoomRow> = {}): RoomRow => ({
  id: roomId,
  teacherId,
  pin: '123456',
  title: 'Revisão de Termodinâmica',
  status: 'aberta',
  cardIds: [firstCard, secondCard],
  currentIndex: 0,
  expiresAt: new Date('2026-09-13T13:00:00.000Z'),
  ...overrides,
});

const makeRepository = (overrides: Partial<LiveRoomRepository> = {}): LiveRoomRepository => ({
  createRoom: async (input) => makeRoom({ pin: input.pin, title: input.title, cardIds: input.cardIds }),
  findByPin: async () => makeRoom(),
  findById: async () => makeRoom({ status: 'em_andamento' }),
  updateRoom: async (_roomId, changes) =>
    makeRoom({
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.currentIndex === undefined ? {} : { currentIndex: changes.currentIndex }),
    }),
  findQuestion: async (cardId) => ({
    cardId,
    question: 'Qual o rendimento de Carnot?',
    keyTerm: 'Carnot',
    highlightTerm: 'rendimento',
    options: [
      { id: 'A', label: 'n = 1 - T2/T1' },
      { id: 'B', label: 'n = T1 + T2' },
      { id: 'C', label: 'n = Q1 / Q2' },
      { id: 'D', label: 'n = 0' },
    ],
  }),
  findCorrectOption: async () => 'A',
  joinRoom: async () => ({ id: participantId, roomId, studentId: null }),
  findParticipant: async () => ({ id: participantId, roomId, studentId: null }),
  findAnswer: async () => undefined,
  saveAnswer: async (input) => ({ id: 'answer', bridgedAt: null, ...input }) as AnswerRow,
  countParticipants: async () => 0,
  ...overrides,
});

describe('pin', () => {
  it('tem seis dígitos e varia entre chamadas', () => {
    const pins = new Set(Array.from({ length: 50 }, () => generatePin()));
    expect([...pins].every((pin) => /^\d{6}$/.test(pin))).toBe(true);
    expect(pins.size).toBeGreaterThan(40);
  });
});

describe('live room service', () => {
  it('cria a sala com PIN e expiração', async () => {
    const service = createLiveRoomService(makeRepository());
    const created = await service.createRoom(teacherId, {
      title: 'Revisão',
      cardIds: [firstCard],
      durationMinutes: 60,
    });
    expect(created.pin).toMatch(/^\d{6}$/);
    expect(created.cardCount).toBeGreaterThan(0);
  });

  it('recusa PIN inexistente ou expirado', async () => {
    const service = createLiveRoomService(makeRepository({ findByPin: async () => undefined }));
    await expect(
      service.join({ pin: '000000', displayName: 'Júlia', guestKey: 'chave-do-device' }, now),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa entrada em sala encerrada', async () => {
    const service = createLiveRoomService(
      makeRepository({ findByPin: async () => makeRoom({ status: 'encerrada' }) }),
    );
    await expect(
      service.join({ pin: '123456', displayName: 'Júlia', guestKey: 'chave-do-device' }, now),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('entrar duas vezes com a mesma chave devolve a mesma participação', async () => {
    const service = createLiveRoomService(makeRepository());
    const first = await service.join(
      { pin: '123456', displayName: 'Júlia', guestKey: 'chave-do-device' },
      now,
    );
    const second = await service.join(
      { pin: '123456', displayName: 'Júlia', guestKey: 'chave-do-device' },
      now,
    );
    expect(second.participantId).toBe(first.participantId);
  });

  it('quem entra com a sala em andamento já recebe a pergunta no ar', async () => {
    const service = createLiveRoomService(
      makeRepository({ findByPin: async () => makeRoom({ status: 'em_andamento', currentIndex: 1 }) }),
    );
    const joined = await service.join(
      { pin: '123456', displayName: 'Júlia', guestKey: 'chave' },
      now,
    );
    expect(joined.currentQuestion?.cardId).toBe(secondCard);
    expect(joined.currentQuestion?.index).toBe(1);
  });

  it('professor de outra sala não inicia nem encerra', async () => {
    const service = createLiveRoomService(makeRepository({ findById: async () => makeRoom() }));
    await expect(service.start(otherTeacherId, roomId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.close(otherTeacherId, roomId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.advance(otherTeacherId, roomId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('iniciar coloca a primeira pergunta no ar', async () => {
    const service = createLiveRoomService(makeRepository({ findById: async () => makeRoom() }));
    const started = await service.start(teacherId, roomId);
    expect(started.question.index).toBe(0);
    expect(started.question.total).toBe(2);
  });

  it('sala sem pergunta disponível falha em vez de abrir vazia', async () => {
    const service = createLiveRoomService(
      makeRepository({
        findById: async () => makeRoom({ cardIds: [firstCard] }),
        findQuestion: async () => undefined,
      }),
    );
    await expect(service.start(teacherId, roomId)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('avançar na última pergunta encerra a sala', async () => {
    const service = createLiveRoomService(
      makeRepository({
        findById: async () => makeRoom({ status: 'em_andamento', currentIndex: 1 }),
      }),
    );
    const advanced = await service.advance(teacherId, roomId);
    expect(advanced.question).toBeNull();
    expect(advanced.room.status).toBe('encerrada');
  });

  it('não avança sala que não começou', async () => {
    const service = createLiveRoomService(makeRepository({ findById: async () => makeRoom() }));
    await expect(service.advance(teacherId, roomId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('aceita a resposta da pergunta que está no ar e diz se acertou', async () => {
    const service = createLiveRoomService(makeRepository());
    await expect(
      service.answer({
        participantId,
        cardId: firstCard,
        optionId: 'A',
        answeredAt: now.toISOString(),
      }),
    ).resolves.toEqual({ correct: true, alreadyAnswered: false });
  });

  it('recusa resposta de pergunta que não está no ar', async () => {
    const service = createLiveRoomService(makeRepository());
    await expect(
      service.answer({
        participantId,
        cardId: secondCard,
        optionId: 'A',
        answeredAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('recusa resposta em sala encerrada', async () => {
    const service = createLiveRoomService(
      makeRepository({ findById: async () => makeRoom({ status: 'encerrada' }) }),
    );
    await expect(
      service.answer({
        participantId,
        cardId: firstCard,
        optionId: 'A',
        answeredAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reconexão não duplica resposta', async () => {
    let saves = 0;
    const service = createLiveRoomService(
      makeRepository({
        findAnswer: async () =>
          ({
            id: 'answer',
            participantId,
            cardId: firstCard,
            optionId: 'B',
            correct: false,
            answeredAt: now,
            bridgedAt: null,
          }) satisfies AnswerRow,
        saveAnswer: async (input) => {
          saves += 1;
          return { id: 'answer', bridgedAt: null, ...input } as AnswerRow;
        },
      }),
    );
    const result = await service.answer({
      participantId,
      cardId: firstCard,
      optionId: 'A',
      answeredAt: now.toISOString(),
    });
    expect(result).toEqual({ correct: false, alreadyAnswered: true });
    expect(saves).toBe(0);
  });

  it('recusa resposta de participação inexistente', async () => {
    const service = createLiveRoomService(makeRepository({ findParticipant: async () => undefined }));
    await expect(
      service.answer({
        participantId,
        cardId: firstCard,
        optionId: 'A',
        answeredAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('avisa o assinante do evento a cada resposta nova', async () => {
    const events: AnsweredEvent[] = [];
    const service = createLiveRoomService(makeRepository(), {
      onAnswered: async (event) => {
        events.push(event);
      },
    });
    await service.answer({
      participantId,
      cardId: firstCard,
      optionId: 'C',
      answeredAt: now.toISOString(),
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cardId: firstCard, correct: false, roomId });
  });

  it('não devolve pergunta de sala que não está em andamento', async () => {
    const service = createLiveRoomService(makeRepository({ findById: async () => makeRoom() }));
    await expect(service.currentQuestion(roomId)).resolves.toBeNull();
  });
});
