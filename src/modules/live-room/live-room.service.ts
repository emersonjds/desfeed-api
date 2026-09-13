import { HttpError, conflict, notFound } from '../../shared/http/errors.js';
import type { LiveRoomRepository, RoomRow } from './live-room.repository.js';
import { generatePin } from './pin.js';
import type {
  AnswerAccepted,
  AnswerBody,
  CreateRoomBody,
  JoinRoomBody,
  Participant,
  Room,
  RoomQuestion,
} from './live-room.schemas.js';

export interface AnsweredEvent {
  roomId: string;
  participantId: string;
  studentId: string | null;
  cardId: string;
  correct: boolean;
  answeredAt: Date;
}

export interface LiveRoomService {
  createRoom: (teacherId: string, body: CreateRoomBody) => Promise<Room>;
  join: (body: JoinRoomBody, now: Date) => Promise<Participant>;
  start: (teacherId: string, roomId: string) => Promise<{ room: Room; question: RoomQuestion }>;
  advance: (teacherId: string, roomId: string) => Promise<{ room: Room; question: RoomQuestion | null }>;
  close: (teacherId: string, roomId: string) => Promise<Room>;
  answer: (body: AnswerBody) => Promise<AnswerAccepted>;
  currentQuestion: (roomId: string) => Promise<RoomQuestion | null>;
}

export interface LiveRoomHooks {
  onAnswered?: (event: AnsweredEvent) => Promise<void>;
}

const MINUTE_MS = 60 * 1000;

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  pin: row.pin,
  title: row.title,
  status: row.status,
  currentIndex: row.currentIndex,
  cardCount: row.cardIds.length,
  expiresAt: row.expiresAt.toISOString(),
});

export const createLiveRoomService = (
  repository: LiveRoomRepository,
  hooks: LiveRoomHooks = {},
): LiveRoomService => {
  const requireOwnedRoom = async (teacherId: string, roomId: string): Promise<RoomRow> => {
    const room = await repository.findById(roomId);
    if (!room) throw notFound('Sala não encontrada.');
    // Autorização por evento: quem não é dono da sala não avança nem encerra, mesmo conectado.
    if (room.teacherId !== teacherId) throw notFound('Sala não encontrada.');
    return room;
  };

  const questionAt = async (room: RoomRow, index: number): Promise<RoomQuestion | null> => {
    const cardId = room.cardIds[index];
    if (!cardId) return null;
    const content = await repository.findQuestion(cardId);
    if (!content) return null;
    return { ...content, index, total: room.cardIds.length };
  };

  return {
    createRoom: async (teacherId, body) => {
      const created = await repository.createRoom({
        teacherId,
        pin: generatePin(),
        title: body.title,
        cardIds: body.cardIds,
        expiresAt: new Date(Date.now() + body.durationMinutes * MINUTE_MS),
      });
      return toRoom(created);
    },

    join: async (body, now) => {
      const room = await repository.findByPin(body.pin, now);
      if (!room) throw notFound('Sala não encontrada ou expirada.');
      if (room.status === 'encerrada') throw conflict('Esta sala já foi encerrada.');

      const participant = await repository.joinRoom({
        roomId: room.id,
        guestKey: body.guestKey,
        displayName: body.displayName,
        ...(body.studentId ? { studentId: body.studentId } : {}),
      });

      return {
        participantId: participant.id,
        roomId: room.id,
        status: room.status,
        currentQuestion:
          room.status === 'em_andamento' ? await questionAt(room, room.currentIndex) : null,
      };
    },

    start: async (teacherId, roomId) => {
      const room = await requireOwnedRoom(teacherId, roomId);
      if (room.status === 'encerrada') throw conflict('Esta sala já foi encerrada.');

      const updated = await repository.updateRoom(roomId, {
        status: 'em_andamento',
        currentIndex: 0,
      });
      if (!updated) throw notFound('Sala não encontrada.');

      const question = await questionAt(updated, 0);
      if (!question) throw new HttpError(422, 'empty_room', 'A sala não tem pergunta disponível.');
      return { room: toRoom(updated), question };
    },

    advance: async (teacherId, roomId) => {
      const room = await requireOwnedRoom(teacherId, roomId);
      if (room.status !== 'em_andamento') throw conflict('A sala não está em andamento.');

      const nextIndex = room.currentIndex + 1;
      if (nextIndex >= room.cardIds.length) {
        const closed = await repository.updateRoom(roomId, { status: 'encerrada' });
        if (!closed) throw notFound('Sala não encontrada.');
        return { room: toRoom(closed), question: null };
      }

      const updated = await repository.updateRoom(roomId, { currentIndex: nextIndex });
      if (!updated) throw notFound('Sala não encontrada.');
      return { room: toRoom(updated), question: await questionAt(updated, nextIndex) };
    },

    close: async (teacherId, roomId) => {
      await requireOwnedRoom(teacherId, roomId);
      const closed = await repository.updateRoom(roomId, { status: 'encerrada' });
      if (!closed) throw notFound('Sala não encontrada.');
      return toRoom(closed);
    },

    answer: async (body) => {
      const participant = await repository.findParticipant(body.participantId);
      if (!participant) throw notFound('Participação não encontrada.');

      const room = await repository.findById(participant.roomId);
      if (!room) throw notFound('Sala não encontrada.');
      if (room.status !== 'em_andamento') throw conflict('A sala não está recebendo resposta.');
      if (room.cardIds[room.currentIndex] !== body.cardId) {
        throw conflict('Esta pergunta não é a que está no ar.');
      }

      const existing = await repository.findAnswer(body.participantId, body.cardId);
      if (existing) return { correct: existing.correct, alreadyAnswered: true };

      const content = await repository.findQuestion(body.cardId);
      if (!content) throw notFound('Card não encontrado.');

      const correctOption = await repository.findCorrectOption(body.cardId);
      const correct = correctOption === body.optionId;
      const answeredAt = new Date(body.answeredAt);

      await repository.saveAnswer({
        roomId: room.id,
        participantId: body.participantId,
        cardId: body.cardId,
        optionId: body.optionId,
        correct,
        answeredAt,
      });

      await hooks.onAnswered?.({
        roomId: room.id,
        participantId: body.participantId,
        studentId: participant.studentId,
        cardId: body.cardId,
        correct,
        answeredAt,
      });

      return { correct, alreadyAnswered: false };
    },

    currentQuestion: async (roomId) => {
      const room = await repository.findById(roomId);
      if (!room) throw notFound('Sala não encontrada.');
      if (room.status !== 'em_andamento') return null;
      return questionAt(room, room.currentIndex);
    },
  };
};
