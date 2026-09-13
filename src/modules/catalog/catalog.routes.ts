import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import { createNotebookRepository } from './catalog.repository.js';
import {
  createNotebookBody,
  listNotebooksQuery,
  listNotebooksResponse,
  notebook,
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
        response: { 201: notebook, 409: errorResponse },
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
        summary: 'Lista os cadernos do aluno, paginados por cursor de data.',
        headers: studentHeader,
        querystring: listNotebooksQuery,
        response: { 200: listNotebooksResponse },
      },
    },
    async (request) => service.listNotebooks(request.headers['x-student-id'], request.query),
  );
};
