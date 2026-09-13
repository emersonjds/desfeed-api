import { z } from 'zod';

export const notebook = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subject: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const createNotebookBody = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(60).optional(),
});

export const listNotebooksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});

export const listNotebooksResponse = z.object({
  items: z.array(notebook),
  nextCursor: z.string().datetime().nullable(),
});

export type Notebook = z.infer<typeof notebook>;
export type CreateNotebookBody = z.infer<typeof createNotebookBody>;
export type ListNotebooksQuery = z.infer<typeof listNotebooksQuery>;
export type ListNotebooksResponse = z.infer<typeof listNotebooksResponse>;
