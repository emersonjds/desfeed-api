import { z } from 'zod';
import { optionId } from '../catalog/cards.schemas.js';

export const roomStatus = z.enum(['aberta', 'em_andamento', 'encerrada']);

export const createRoomBody = z.object({
  title: z.string().trim().min(1).max(120),
  cardIds: z.array(z.string().uuid()).min(1).max(50),
  durationMinutes: z.number().int().min(5).max(240).default(60),
});

export const room = z.object({
  id: z.string().uuid(),
  pin: z.string(),
  title: z.string(),
  status: roomStatus,
  currentIndex: z.number().int().nonnegative(),
  cardCount: z.number().int().positive(),
  expiresAt: z.string().datetime(),
});

export const roomQuestion = z.object({
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  cardId: z.string().uuid(),
  question: z.string(),
  keyTerm: z.string(),
  highlightTerm: z.string(),
  options: z.array(z.object({ id: optionId, label: z.string() })).length(4),
});

export const joinRoomBody = z.object({
  pin: z.string().trim().length(6),
  displayName: z.string().trim().min(1).max(60),
  studentId: z.string().uuid().optional(),
  guestKey: z.string().trim().min(8).max(64),
});

export const participant = z.object({
  participantId: z.string().uuid(),
  roomId: z.string().uuid(),
  status: roomStatus,
  currentQuestion: roomQuestion.nullable(),
});

export const answerBody = z.object({
  participantId: z.string().uuid(),
  cardId: z.string().uuid(),
  optionId,
  answeredAt: z.string().datetime(),
});

export const answerAccepted = z.object({
  correct: z.boolean(),
  alreadyAnswered: z.boolean(),
});

export const roomParams = z.object({ roomId: z.string().uuid() });

export type CreateRoomBody = z.infer<typeof createRoomBody>;
export type Room = z.infer<typeof room>;
export type RoomQuestion = z.infer<typeof roomQuestion>;
export type JoinRoomBody = z.infer<typeof joinRoomBody>;
export type Participant = z.infer<typeof participant>;
export type AnswerBody = z.infer<typeof answerBody>;
export type AnswerAccepted = z.infer<typeof answerAccepted>;
export type RoomStatus = z.infer<typeof roomStatus>;
