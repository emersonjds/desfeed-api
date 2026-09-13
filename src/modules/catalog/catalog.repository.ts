import { and, desc, eq, lt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { notebooks } from '../../db/schema.js';
import type { CreateNotebookBody, Notebook } from './catalog.schemas.js';

export interface NotebookRepository {
  findByStudentAndTitle: (studentId: string, title: string) => Promise<Notebook | undefined>;
  listByStudent: (studentId: string, limit: number, cursor?: Date) => Promise<Notebook[]>;
  create: (studentId: string, input: CreateNotebookBody) => Promise<Notebook>;
}

const toNotebook = (row: typeof notebooks.$inferSelect): Notebook => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  createdAt: row.createdAt.toISOString(),
});

export const createNotebookRepository = (db: Database): NotebookRepository => ({
  findByStudentAndTitle: async (studentId, title) => {
    const [row] = await db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.studentId, studentId), eq(notebooks.title, title)))
      .limit(1);
    return row ? toNotebook(row) : undefined;
  },

  listByStudent: async (studentId, limit, cursor) => {
    const rows = await db
      .select()
      .from(notebooks)
      .where(
        cursor
          ? and(eq(notebooks.studentId, studentId), lt(notebooks.createdAt, cursor))
          : eq(notebooks.studentId, studentId),
      )
      .orderBy(desc(notebooks.createdAt))
      .limit(limit);
    return rows.map(toNotebook);
  },

  create: async (studentId, input) => {
    const [row] = await db
      .insert(notebooks)
      .values({ studentId, title: input.title, subject: input.subject ?? null })
      .returning();
    if (!row) throw new Error('notebook insert returned no row');
    return toNotebook(row);
  },
});
