import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  cardVersions,
  cards,
  liveRooms,
  roomAnswers,
  roomParticipants,
} from '../../db/schema.js';
import type { RoomQuestion, RoomStatus } from './live-room.schemas.js';

export interface RoomRow {
  id: string;
  teacherId: string;
  pin: string;
  title: string;
  status: RoomStatus;
  cardIds: string[];
  currentIndex: number;
  expiresAt: Date;
}

export interface ParticipantRow {
  id: string;
  roomId: string;
  studentId: string | null;
}

export interface AnswerRow {
  id: string;
  participantId: string;
  cardId: string;
  optionId: string;
  correct: boolean;
  answeredAt: Date;
  bridgedAt: Date | null;
}

export interface LiveRoomRepository {
  createRoom: (input: {
    teacherId: string;
    pin: string;
    title: string;
    cardIds: string[];
    expiresAt: Date;
  }) => Promise<RoomRow>;
  findByPin: (pin: string, now: Date) => Promise<RoomRow | undefined>;
  findById: (roomId: string) => Promise<RoomRow | undefined>;
  updateRoom: (
    roomId: string,
    changes: { status?: RoomStatus; currentIndex?: number },
  ) => Promise<RoomRow | undefined>;
  findQuestion: (cardId: string) => Promise<Omit<RoomQuestion, 'index' | 'total'> | undefined>;
  findCorrectOption: (cardId: string) => Promise<string | undefined>;
  joinRoom: (input: {
    roomId: string;
    guestKey: string;
    displayName: string;
    studentId?: string | undefined;
  }) => Promise<ParticipantRow>;
  findParticipant: (participantId: string) => Promise<ParticipantRow | undefined>;
  findAnswer: (participantId: string, cardId: string) => Promise<AnswerRow | undefined>;
  saveAnswer: (input: {
    roomId: string;
    participantId: string;
    cardId: string;
    optionId: string;
    correct: boolean;
    answeredAt: Date;
  }) => Promise<AnswerRow>;
  countParticipants: (roomId: string) => Promise<number>;
}

const toRoom = (row: typeof liveRooms.$inferSelect): RoomRow => ({
  id: row.id,
  teacherId: row.teacherId,
  pin: row.pin,
  title: row.title,
  status: row.status,
  cardIds: row.cardIds,
  currentIndex: row.currentIndex,
  expiresAt: row.expiresAt,
});

export const createLiveRoomRepository = (db: Database): LiveRoomRepository => ({
  createRoom: async (input) => {
    const [row] = await db.insert(liveRooms).values(input).returning();
    if (!row) throw new Error('room insert returned no row');
    return toRoom(row);
  },

  findByPin: async (pin, now) => {
    const [row] = await db
      .select()
      .from(liveRooms)
      .where(and(eq(liveRooms.pin, pin), gt(liveRooms.expiresAt, now)))
      .limit(1);
    return row ? toRoom(row) : undefined;
  },

  findById: async (roomId) => {
    const [row] = await db.select().from(liveRooms).where(eq(liveRooms.id, roomId)).limit(1);
    return row ? toRoom(row) : undefined;
  },

  updateRoom: async (roomId, changes) => {
    const [row] = await db
      .update(liveRooms)
      .set({
        ...(changes.status ? { status: changes.status } : {}),
        ...(changes.currentIndex === undefined ? {} : { currentIndex: changes.currentIndex }),
        ...(changes.status === 'em_andamento' ? { startedAt: new Date() } : {}),
        ...(changes.status === 'encerrada' ? { closedAt: new Date() } : {}),
      })
      .where(eq(liveRooms.id, roomId))
      .returning();
    return row ? toRoom(row) : undefined;
  },

  findQuestion: async (cardId) => {
    const [row] = await db
      .select({
        cardId: cards.id,
        question: cardVersions.question,
        keyTerm: cardVersions.keyTerm,
        highlightTerm: cardVersions.highlightTerm,
        options: cardVersions.options,
        correctOptionId: cardVersions.correctOptionId,
      })
      .from(cards)
      .innerJoin(
        cardVersions,
        and(eq(cardVersions.cardId, cards.id), eq(cardVersions.version, cards.currentVersion)),
      )
      .where(eq(cards.id, cardId))
      .limit(1);
    if (!row) return undefined;
    return {
      cardId: row.cardId,
      question: row.question,
      keyTerm: row.keyTerm,
      highlightTerm: row.highlightTerm,
      options: row.options,
    };
  },

  findCorrectOption: async (cardId) => {
    const [row] = await db
      .select({ correctOptionId: cardVersions.correctOptionId })
      .from(cards)
      .innerJoin(
        cardVersions,
        and(eq(cardVersions.cardId, cards.id), eq(cardVersions.version, cards.currentVersion)),
      )
      .where(eq(cards.id, cardId))
      .limit(1);
    return row?.correctOptionId;
  },

  joinRoom: async (input) => {
    const [row] = await db
      .insert(roomParticipants)
      .values({
        roomId: input.roomId,
        guestKey: input.guestKey,
        displayName: input.displayName,
        studentId: input.studentId ?? null,
      })
      .onConflictDoUpdate({
        target: [roomParticipants.roomId, roomParticipants.guestKey],
        set: { displayName: input.displayName, studentId: input.studentId ?? null },
      })
      .returning();
    if (!row) throw new Error('participant upsert returned no row');
    return { id: row.id, roomId: row.roomId, studentId: row.studentId };
  },

  findParticipant: async (participantId) => {
    const [row] = await db
      .select()
      .from(roomParticipants)
      .where(eq(roomParticipants.id, participantId))
      .limit(1);
    return row ? { id: row.id, roomId: row.roomId, studentId: row.studentId } : undefined;
  },

  findAnswer: async (participantId, cardId) => {
    const [row] = await db
      .select()
      .from(roomAnswers)
      .where(and(eq(roomAnswers.participantId, participantId), eq(roomAnswers.cardId, cardId)))
      .limit(1);
    return row;
  },

  saveAnswer: async (input) => {
    const [row] = await db.insert(roomAnswers).values(input).returning();
    if (!row) throw new Error('answer insert returned no row');
    return row;
  },

  countParticipants: async (roomId) => {
    const rows = await db
      .select({ id: roomParticipants.id })
      .from(roomParticipants)
      .where(eq(roomParticipants.roomId, roomId));
    return rows.length;
  },
});
