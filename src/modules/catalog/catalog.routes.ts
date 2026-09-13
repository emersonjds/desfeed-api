import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import { createNotebookRepository } from './catalog.repository.js';
import {
  createNotebookBody,
  notebookDetail,
  notebookLibrary,
  notebookParams,
  notebookSummary,
} from './catalog.schemas.js';
import { createCatalogService } from './catalog.service.js';

export const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createCatalogService(createNotebookRepository(app.db));

  app.post(
    '/notebooks',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Cria um caderno para o aluno autenticado.',
        headers: studentHeader,
        body: createNotebookBody,
        response: { 201: notebookSummary, 409: errorResponse },
      },
    },
    async (request, reply) => {
      const created = await service.createNotebook(request.headers['x-student-id'], request.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/notebooks',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Biblioteca do aluno: cadernos, métricas de retenção e picos de esquecimento.',
        headers: studentHeader,
        response: { 200: notebookLibrary },
      },
    },
    async (request) => service.getLibrary(request.headers['x-student-id']),
  );

  app.get(
    '/notebooks/:notebookId',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Detalhe de um caderno com seus temas.',
        headers: studentHeader,
        params: notebookParams,
        response: { 200: notebookDetail, 404: errorResponse },
      },
    },
    async (request) =>
      service.getNotebook(request.headers['x-student-id'], request.params.notebookId),
  );
};
