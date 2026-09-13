import { z } from 'zod';

export const notebookStatus = z.enum(['revisao-hoje', 'estavel', 'reforco']);

// Campo derivado do FSRS: nulo até SPA-359 existir. Ver docs/contrato-app/spec.md.
const pendingScheduling = <Schema extends z.ZodTypeAny>(schema: Schema) => schema.nullable();

export const notebookSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subject: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  sourceLabel: z.string(),
  cardCount: z.number().int().nonnegative(),
  status: pendingScheduling(notebookStatus),
  retentionPercent: pendingScheduling(z.number().min(0).max(100)),
  nextReviewLabel: pendingScheduling(z.string()),
});

export const forgettingPeak = z.object({
  id: z.string().uuid(),
  title: z.string(),
  whenLabel: z.string(),
  urgency: z.enum(['alta', 'media', 'baixa']),
  cardCount: z.number().int().positive(),
  detail: z.string(),
});

export const notebookLibrary = z.object({
  globalRetentionPercent: pendingScheduling(z.number().min(0).max(100)),
  consolidatedConcepts: z.number().int().nonnegative(),
  totalConcepts: z.number().int().nonnegative(),
  stabilityDays: pendingScheduling(z.number().nonnegative()),
  notebooks: z.array(notebookSummary),
  peaks: z.array(forgettingPeak),
});

export const themeSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  cardCount: z.number().int().nonnegative(),
});

export const notebookDetail = notebookSummary.extend({
  createdAt: z.string().datetime(),
  themes: z.array(themeSummary),
});

export const createNotebookBody = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(60).optional(),
  coverUrl: z.string().url().optional(),
  sourceLabel: z.string().trim().min(1).max(60).optional(),
});

export const notebookParams = z.object({
  notebookId: z.string().uuid(),
});

export type NotebookSummary = z.infer<typeof notebookSummary>;
export type NotebookLibrary = z.infer<typeof notebookLibrary>;
export type NotebookDetail = z.infer<typeof notebookDetail>;
export type ThemeSummary = z.infer<typeof themeSummary>;
export type CreateNotebookBody = z.infer<typeof createNotebookBody>;
