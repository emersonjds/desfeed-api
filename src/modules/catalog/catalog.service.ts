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
    const [notebooks, totals, scheduling, peaks] = await Promise.all([
      repository.listByStudent(studentId),
      repository.loadTotals(studentId),
      repository.loadScheduling(studentId),
      repository.loadPeaks(studentId),
    ]);

    const schedulingByNotebook = new Map(scheduling.map((row) => [row.notebookId, row]));
    const totalConcepts = notebooks.reduce((total, notebook) => total + notebook.cardCount, 0);

    return {
      ...totals,
      totalConcepts,
      notebooks: notebooks.map((notebook) => {
        const row = schedulingByNotebook.get(notebook.id);
        if (!row) return notebook;

        return {
          ...notebook,
          coverUrl: row.coverUrl ?? notebook.coverUrl,
          status: row.status,
          retentionPercent: row.retentionPercent,
          nextReviewLabel: row.nextReviewLabel,
        };
      }),
      peaks,
    };
  },

  getNotebook: async (studentId, notebookId) => {
    const notebook = await repository.findById(studentId, notebookId);
    if (!notebook) throw notFound('Caderno não encontrado para este aluno.');
    return notebook;
  },
});
