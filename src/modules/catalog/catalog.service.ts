import { conflict } from '../../shared/http/errors.js';
import type { NotebookRepository } from './catalog.repository.js';
import type {
  CreateNotebookBody,
  ListNotebooksQuery,
  ListNotebooksResponse,
  Notebook,
} from './catalog.schemas.js';

export interface CatalogService {
  createNotebook: (studentId: string, input: CreateNotebookBody) => Promise<Notebook>;
  listNotebooks: (studentId: string, query: ListNotebooksQuery) => Promise<ListNotebooksResponse>;
}

export const createCatalogService = (repository: NotebookRepository): CatalogService => ({
  createNotebook: async (studentId, input) => {
    const existing = await repository.findByStudentAndTitle(studentId, input.title);
    if (existing) throw conflict(`Caderno "${input.title}" já existe para este aluno.`);
    return repository.create(studentId, input);
  },

  listNotebooks: async (studentId, query) => {
    const items = await repository.listByStudent(
      studentId,
      query.limit,
      query.cursor ? new Date(query.cursor) : undefined,
    );
    const nextCursor = items.length === query.limit ? (items.at(-1)?.createdAt ?? null) : null;
    return { items, nextCursor };
  },
});
