import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import type { CardGenerator } from '../ingestion/card-generator.js';
import {
  generateSessionBody,
  generateSessionResponse,
  studyThemesResponse,
} from './study.schemas.js';
import { createStudyService } from './study.service.js';

export interface StudyRoutesOptions {
  cardGenerator?: CardGenerator | undefined;
}

// Geração custa dinheiro em LLM: limite próprio, bem abaixo do limite global da API.
const GENERATION_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };

export const studyRoutes: FastifyPluginAsyncZod<StudyRoutesOptions> = async (app, options) => {
  const service = createStudyService(app.db, options.cardGenerator);

  app.get(
    '/study/themes',
    {
      schema: {
        tags: ['study'],
        summary: 'Temas sugeridos para o aluno escolher o que treinar agora.',
        headers: studentHeader,
        response: { 200: studyThemesResponse, 404: errorResponse },
      },
    },
    async (request) => service.listThemes(request.headers['x-student-id']),
  );

  app.post(
    '/study/sessions',
    {
      config: {
        rateLimit: {
          ...GENERATION_RATE_LIMIT,
          keyGenerator: (request) => request.headers['x-student-id'] as string,
        },
      },
      schema: {
        tags: ['study'],
        summary: 'O aluno escolhe o assunto e recebe a sessão gerada, já na fila FSRS.',
        headers: studentHeader,
        body: generateSessionBody,
        response: { 200: generateSessionResponse, 404: errorResponse, 503: errorResponse },
      },
    },
    async (request) => {
      if (!options.cardGenerator) {
        throw new HttpError(
          503,
          'generation_unavailable',
          'Geração de cards indisponível: falta configurar a chave do provedor.',
        );
      }
      return service.generateSession(request.headers['x-student-id'], request.body);
    },
  );
};
