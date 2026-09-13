import { conflict, notFound } from '../../shared/http/errors.js';
import type { NotebookRepository } from './catalog.repository.js';
import type {
  CreateNotebookBody,
  NotebookDetail,
  NotebookLibrary,
  NotebookSummary,
} from './catalog.schemas.js';

export interface CatalogService {
  createNotebook: (studentId: string, input: CreateNotebookBody) => Promise<NotebookSummary>;
  getLibrary: (studentId: string) => Promise<NotebookLibrary>;
  getNotebook: (studentId: string, notebookId: string) => Promise<NotebookDetail>;
}

export const createCatalogService = (repository: NotebookRepository): CatalogService => ({
  createNotebook: async (studentId, input) => {
    const existing = await repository.findByStudentAndTitle(studentId, input.title);
    if (existing) throw conflict(`Caderno "${input.title}" já existe para este aluno.`);
    return repository.create(studentId, input);
  },

  getLibrary: async (studentId) => {
    const notebooks = await repository.listByStudent(studentId);
    const totalConcepts = notebooks.reduce((total, notebook) => total + notebook.cardCount, 0);
    return {
      globalRetentionPercent: null,
      consolidatedConcepts: 0,
      totalConcepts,
      stabilityDays: null,
      notebooks,
      peaks: [],
    };
  },

  getNotebook: async (studentId, notebookId) => {
    const notebook = await repository.findById(studentId, notebookId);
    if (!notebook) throw notFound('Caderno não encontrado para este aluno.');
    return notebook;
  },
});
