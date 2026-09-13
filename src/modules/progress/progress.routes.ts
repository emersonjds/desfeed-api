import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import { progressResponse } from './progress.schemas.js';
import { createProgressService } from './progress.service.js';

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createProgressService(app.db);

  app.get(
    '/progress',
    {
      schema: {
        tags: ['progress'],
        summary: 'O aluno contra o próprio esquecimento: retenção, matérias e meta da turma.',
        headers: studentHeader,
        response: { 200: progressResponse, 404: errorResponse },
      },
    },
    async (request) => service.getProgress(request.headers['x-student-id'], new Date()),
  );
};
