import { z } from 'zod';
import { queueCard } from '../scheduling/scheduling.schemas.js';

export const studyTheme = z.object({
  id: z.string(),
  subject: z.string(),
  title: z.string(),
  reason: z.string(),
  cardCount: z.number().int().positive(),
});

export const studyThemesResponse = z.object({
  suggested: z.array(studyTheme),
  subjects: z.array(z.string()),
});

export const generateSessionBody = z.object({
  subject: z.string().min(1),
  theme: z.string().min(1),
  cardCount: z.number().int().min(5).max(30),
});

export const generateSessionResponse = z.object({
  theme: z.string(),
  cards: z.array(queueCard),
});

export type StudyThemesResponse = z.infer<typeof studyThemesResponse>;
export type GenerateSessionBody = z.infer<typeof generateSessionBody>;
export type GenerateSessionResponse = z.infer<typeof generateSessionResponse>;
