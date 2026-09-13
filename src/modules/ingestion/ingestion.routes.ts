import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, errorResponse } from '../../shared/http/errors.js';
import { studentHeader } from '../../shared/http/identity.js';
import type { CardGenerator } from './card-generator.js';
import { createIngestionRepository } from './ingestion.repository.js';
import { ingestBody, ingestResponse, notebookParams } from './ingestion.schemas.js';
import { createIngestionService } from './ingestion.service.js';

export interface IngestionRoutesOptions {
  cardGenerator?: CardGenerator | undefined;
}

// Upload de imagem custa dinheiro em LLM: limite próprio, bem abaixo do limite global da API.
const INGEST_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };

export const ingestionRoutes: FastifyPluginAsyncZod<IngestionRoutesOptions> = async (
  app,
  options,
) => {
  const generator = options.cardGenerator;
  const service = generator
    ? createIngestionService(createIngestionRepository(app.db), generator)
    : undefined;

  app.post(
    '/notebooks/:notebookId/ingest',
    {
      config: { rateLimit: { ...INGEST_RATE_LIMIT, keyGenerator: (request) => request.headers['x-student-id'] as string } },
      schema: {
        tags: ['ingestion'],
        summary: 'Transforma foto de caderno ou tema em cards pendentes de curadoria.',
        headers: studentHeader,
        params: notebookParams,
        body: ingestBody,
        response: {
          201: ingestResponse,
          404: errorResponse,
          502: errorResponse,
          503: errorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!service) {
        throw new HttpError(
          503,
          'generation_unavailable',
          'Geração de cards indisponível: falta configurar a chave do provedor.',
        );
      }
      const result = await service.ingest(
        request.headers['x-student-id'],
        request.params.notebookId,
        request.body,
      );
      return reply.code(201).send(result);
    },
  );
};
