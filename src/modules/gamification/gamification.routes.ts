import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import { createGamificationRepository } from './gamification.repository.js';
import { profile, ranking, sessionToday, updateGoalBody } from './gamification.schemas.js';
import { createGamificationService } from './gamification.service.js';

export const gamificationRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createGamificationService(createGamificationRepository(app.db));

  app.get(
    '/session/today',
    {
      schema: {
        tags: ['gamification'],
        summary: 'Progresso do dia: revisões feitas, meta, streak e XP.',
        headers: studentHeader,
        response: { 200: sessionToday, 404: errorResponse },
      },
    },
    async (request) => service.getSession(request.headers['x-student-id'], new Date()),
  );

  app.get(
    '/profile',
    {
      schema: {
        tags: ['gamification'],
        summary: 'Perfil e saúde cognitiva: retenção, fatos estabilizados e dias ativos.',
        headers: studentHeader,
        response: { 200: profile, 404: errorResponse },
      },
    },
    async (request) => service.getProfile(request.headers['x-student-id'], new Date()),
  );

  app.patch(
    '/profile',
    {
      schema: {
        tags: ['gamification'],
        summary: 'Ajusta meta diária e horário do lembrete. Reduzir a meta não quebra o streak.',
        headers: studentHeader,
        body: updateGoalBody,
        response: { 200: profile, 404: errorResponse },
      },
    },
    async (request) => service.updatePreferences(request.headers['x-student-id'], request.body),
  );

  app.get(
    '/ranking',
    {
      schema: {
        tags: ['gamification'],
        summary: 'Liga da semana com apuração na virada, promoção e rebaixamento.',
        headers: studentHeader,
        response: { 200: ranking, 404: errorResponse },
      },
    },
    async (request) => service.getRanking(request.headers['x-student-id'], new Date()),
  );
};
