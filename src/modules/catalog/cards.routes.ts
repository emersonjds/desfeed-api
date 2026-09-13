import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader, teacherHeader } from '../../shared/http/identity.js';
import { createCardRepository } from './cards.repository.js';
import {
  card,
  cardContent,
  cardList,
  cardParams,
  createThemeBody,
  decisionBody,
  listCardsQuery,
  notebookParams,
  reportAccepted,
  reportBody,
  theme,
  themeParams,
} from './cards.schemas.js';
import { createCardService } from './cards.service.js';

export const cardRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createCardService(createCardRepository(app.db));

  app.post(
    '/notebooks/:notebookId/themes',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Cria um tema dentro de um caderno do aluno.',
        headers: studentHeader,
        params: notebookParams,
        body: createThemeBody,
        response: { 201: theme, 404: errorResponse },
      },
    },
    async (request, reply) => {
      const created = await service.createTheme(
        request.headers['x-student-id'],
        request.params.notebookId,
        request.body.title,
      );
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/themes/:themeId/cards',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Cards aprovados de um tema. Card rejeitado ou em revisão nunca aparece aqui.',
        headers: studentHeader,
        params: themeParams,
        querystring: listCardsQuery,
        response: { 200: cardList, 404: errorResponse },
      },
    },
    async (request) =>
      service.listApproved(
        request.headers['x-student-id'],
        request.params.themeId,
        request.query,
      ),
  );

  app.post(
    '/themes/:themeId/cards',
    {
      schema: {
        tags: ['curation'],
        summary: 'Professor cria um card já aprovado no tema.',
        headers: teacherHeader,
        params: themeParams,
        body: cardContent,
        response: { 201: card, 404: errorResponse },
      },
    },
    async (request, reply) => {
      const created = await service.createCard(
        request.headers['x-teacher-id'],
        request.params.themeId,
        request.body,
      );
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/curation/cards',
    {
      schema: {
        tags: ['curation'],
        summary: 'Fila de curadoria: cards aguardando decisão do professor.',
        headers: teacherHeader,
        querystring: listCardsQuery,
        response: { 200: cardList },
      },
    },
    async (request) => service.listCuration(request.query),
  );

  app.post(
    '/cards/:cardId/decision',
    {
      schema: {
        tags: ['curation'],
        summary: 'Aprova ou rejeita um card em uma requisição, sem formulário.',
        headers: teacherHeader,
        params: cardParams,
        body: decisionBody,
        response: { 200: card, 404: errorResponse },
      },
    },
    async (request) =>
      service.decide(request.headers['x-teacher-id'], request.params.cardId, request.body),
  );

  app.put(
    '/cards/:cardId',
    {
      schema: {
        tags: ['curation'],
        summary: 'Edita um card criando uma versão nova; a versão anterior é preservada.',
        headers: teacherHeader,
        params: cardParams,
        body: cardContent,
        response: { 200: card, 404: errorResponse },
      },
    },
    async (request) =>
      service.editCard(request.headers['x-teacher-id'], request.params.cardId, request.body),
  );

  app.post(
    '/cards/:cardId/reports',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Aluno reporta um card. Erro factual tira o card da fila de todos.',
        headers: studentHeader,
        params: cardParams,
        body: reportBody,
        response: { 201: reportAccepted, 404: errorResponse, 409: errorResponse },
      },
    },
    async (request, reply) => {
      const accepted = await service.report(
        request.headers['x-student-id'],
        request.params.cardId,
        request.body,
      );
      return reply.code(201).send(accepted);
    },
  );
};
