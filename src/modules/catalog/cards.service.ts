import { conflict, notFound } from '../../shared/http/errors.js';
import type { CardRepository } from './cards.repository.js';
import type {
  Card,
  CardContent,
  CardList,
  DecisionBody,
  ListCardsQuery,
  ReportAccepted,
  ReportBody,
  Theme,
} from './cards.schemas.js';

export interface CardService {
  createTheme: (studentId: string, notebookId: string, title: string) => Promise<Theme>;
  createCard: (teacherId: string, themeId: string, content: CardContent) => Promise<Card>;
  editCard: (teacherId: string, cardId: string, content: CardContent) => Promise<Card>;
  listApproved: (studentId: string, themeId: string, query: ListCardsQuery) => Promise<CardList>;
  listCuration: (query: ListCardsQuery) => Promise<CardList>;
  decide: (teacherId: string, cardId: string, body: DecisionBody) => Promise<Card>;
  report: (studentId: string, cardId: string, body: ReportBody) => Promise<ReportAccepted>;
}

const paginate = (items: Card[], limit: number): CardList => ({
  items,
  nextCursor: items.length === limit ? (items.at(-1)?.createdAt ?? null) : null,
});

export const createCardService = (repository: CardRepository): CardService => ({
  createTheme: async (studentId, notebookId, title) => {
    const owner = await repository.findNotebookOwner(notebookId);
    if (owner !== studentId) throw notFound('Caderno não encontrado para este aluno.');
    return repository.createTheme(notebookId, title);
  },

  createCard: async (_teacherId, themeId, content) => {
    const owner = await repository.findThemeOwner(themeId);
    if (!owner) throw notFound('Tema não encontrado.');
    return repository.createCard(themeId, content, 'approved');
  },

  editCard: async (_teacherId, cardId, content) => {
    const edited = await repository.addVersion(cardId, content);
    if (!edited) throw notFound('Card não encontrado.');
    return edited;
  },

  listApproved: async (studentId, themeId, query) => {
    const owner = await repository.findThemeOwner(themeId);
    if (owner !== studentId) throw notFound('Tema não encontrado para este aluno.');
    const items = await repository.listByTheme(
      themeId,
      ['approved'],
      query.limit,
      query.cursor ? new Date(query.cursor) : undefined,
    );
    return paginate(items, query.limit);
  },

  listCuration: async (query) => {
    const items = await repository.listForCuration(
      query.limit,
      query.cursor ? new Date(query.cursor) : undefined,
    );
    return paginate(items, query.limit);
  },

  decide: async (teacherId, cardId, body) => {
    const decided = await repository.setStatus(cardId, body.decision, teacherId);
    if (!decided) throw notFound('Card não encontrado.');
    return decided;
  },

  report: async (studentId, cardId, body) => {
    const reported = await repository.findById(cardId);
    if (!reported) throw notFound('Card não encontrado.');

    try {
      await repository.saveReport(cardId, studentId, reported.version, body);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw conflict('Este card já foi reportado por você.');
      }
      throw error;
    }

    const suspends = body.reason === 'factualmente-errado' && reported.status === 'approved';
    if (!suspends) return { cardId, status: reported.status };

    const suspended = await repository.suspend(cardId);
    return { cardId, status: suspended.status };
  },
});
