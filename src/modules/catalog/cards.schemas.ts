import { z } from 'zod';

export const optionId = z.enum(['A', 'B', 'C', 'D']);

export const cardOption = z.object({
  id: optionId,
  label: z.string().trim().min(1).max(200),
});

export const cardContent = z.object({
  question: z.string().trim().min(1).max(400),
  keyTerm: z.string().trim().min(1).max(120),
  highlightTerm: z.string().trim().min(1).max(120),
  options: z.array(cardOption).length(4),
  correctOptionId: optionId,
  imageUrl: z.string().url().nullable().default(null),
});

export const cardStatus = z.enum(['pending', 'approved', 'rejected', 'under_review']);

export const card = cardContent.extend({
  id: z.string().uuid(),
  themeId: z.string().uuid(),
  status: cardStatus,
  source: z.enum(['ai', 'teacher']),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export const cardList = z.object({
  items: z.array(card),
  nextCursor: z.string().datetime().nullable(),
});

export const listCardsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});

export const createThemeBody = z.object({
  title: z.string().trim().min(1).max(120),
});

export const theme = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  title: z.string(),
  createdAt: z.string().datetime(),
});

export const decisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
});

export const reportBody = z.object({
  reason: z.enum(['factualmente-errado', 'fora-do-tema', 'confuso', 'duplicado']),
  comment: z.string().trim().min(1).max(400).optional(),
});

export const reportAccepted = z.object({
  cardId: z.string().uuid(),
  status: cardStatus,
});

export const themeParams = z.object({ themeId: z.string().uuid() });
export const cardParams = z.object({ cardId: z.string().uuid() });
export const notebookParams = z.object({ notebookId: z.string().uuid() });

export type CardStatus = z.infer<typeof cardStatus>;
export type CardContent = z.infer<typeof cardContent>;
export type Card = z.infer<typeof card>;
export type CardList = z.infer<typeof cardList>;
export type ListCardsQuery = z.infer<typeof listCardsQuery>;
export type Theme = z.infer<typeof theme>;
export type CreateThemeBody = z.infer<typeof createThemeBody>;
export type DecisionBody = z.infer<typeof decisionBody>;
export type ReportBody = z.infer<typeof reportBody>;
export type ReportAccepted = z.infer<typeof reportAccepted>;
