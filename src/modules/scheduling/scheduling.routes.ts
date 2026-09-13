import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import { createSchedulingRepository } from './scheduling.repository.js';
import {
  queueTodayResponse,
  submitReviewBody,
  submitReviewResponse,
} from './scheduling.schemas.js';
import { createSchedulingService } from './scheduling.service.js';

export const schedulingRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createSchedulingService(createSchedulingRepository(app.db));

  app.get(
    '/queue/today',
    {
      schema: {
        tags: ['scheduling'],
        summary: 'Fila do dia: cards devidos agora, mais os novos até o teto diário do aluno.',
        headers: studentHeader,
        response: { 200: queueTodayResponse, 404: errorResponse },
      },
    },
    async (request) => service.getQueue(request.headers['x-student-id'], new Date()),
  );

  app.post(
    '/reviews',
    {
      schema: {
        tags: ['scheduling'],
        summary: 'Registra uma revisão e avança o estado FSRS do card para o aluno.',
        headers: studentHeader,
        body: submitReviewBody,
        response: { 200: submitReviewResponse, 404: errorResponse },
      },
    },
    async (request) => service.submitReview(request.headers['x-student-id'], request.body),
  );
};
