import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Database } from './db/client.js';
import { cardRoutes } from './modules/catalog/cards.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { gamificationRoutes } from './modules/gamification/gamification.routes.js';
import type { CardGenerator } from './modules/ingestion/card-generator.js';
import { ingestionRoutes } from './modules/ingestion/ingestion.routes.js';
import { liveRoomRoutes } from './modules/live-room/live-room.routes.js';
import type { LiveRoomHooks } from './modules/live-room/live-room.service.js';
import { progressRoutes } from './modules/progress/progress.routes.js';
import { schedulingRoutes } from './modules/scheduling/scheduling.routes.js';
import { studyRoutes } from './modules/study/study.routes.js';
import { teacherRoutes } from './modules/teacher/teacher.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { asDatabaseHttpError, HttpError } from './shared/http/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface AppOptions {
  db: Database;
  cardGenerator?: CardGenerator | undefined;
  liveRoomHooks?: LiveRoomHooks | undefined;
  corsOrigins?: string[];
  publicUrl?: string;
  logLevel?: string;
}

export const buildApp = async (options: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: { level: options.logLevel ?? 'info' },
    // Foto de caderno chega como data URI base64 no corpo; base64 infla ~33% sobre o arquivo.
    bodyLimit: 8 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', options.db);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: 'validation_error',
        message: error.validation.map((issue) => issue.message).join('; '),
      });
    }
    const databaseError = asDatabaseHttpError(error);
    if (databaseError) {
      return reply
        .code(databaseError.statusCode)
        .send({ error: databaseError.error, message: databaseError.message });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.error, message: error.message });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal_error', message: 'Erro interno.' });
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const allowList = options.corsOrigins ?? [];
  await app.register(cors, {
    origin: allowList.length > 0 ? allowList : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Memfeed API',
        version: '0.1.0',
        description:
          'Backend do Memfeed — catálogo de cadernos, ingestão por IA, agendamento FSRS, sala ao vivo e relatórios de turma agregados. Contrato consumido pelo app do aluno e pelo painel do professor.',
      },
      servers: [
        options.publicUrl
          ? { url: options.publicUrl, description: 'production' }
          : { url: 'http://localhost:3000', description: 'local' },
      ],
      tags: [
        { name: 'health', description: 'Liveness do serviço.' },
        { name: 'catalog', description: 'Cadernos, temas e cards, sob o prefixo /api.' },
        { name: 'curation', description: 'Fila do professor: aprovar, rejeitar e editar card.' },
        { name: 'scheduling', description: 'Fila do dia e registro de revisão, com FSRS no servidor.' },
        { name: 'gamification', description: 'Sessão do dia, perfil, streak e liga. Contagem sempre do servidor.' },
        { name: 'ingestion', description: 'Foto de caderno ou tema vira card pendente de curadoria.' },
        { name: 'live-room', description: 'Sala ao vivo por PIN, com sincronização por socket.' },
        { name: 'progress', description: 'O aluno contra o próprio esquecimento. Sem ranking entre colegas.' },
        { name: 'study', description: 'O aluno escolhe o assunto e a IA gera a sessão.' },
        { name: 'teacher', description: 'Painel do professor: gerar aula, publicar e ler a turma agregada.' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, {
    routePrefix: '/swagger',
    theme: {
      css: [{ filename: 'no-topbar.css', content: '.swagger-ui .topbar { display: none }' }],
    },
  });

  await app.register(healthRoutes);
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(cardRoutes, { prefix: '/api' });
  await app.register(schedulingRoutes, { prefix: '/api' });
  await app.register(gamificationRoutes, { prefix: '/api' });
  await app.register(ingestionRoutes, { prefix: '/api', cardGenerator: options.cardGenerator });
  await app.register(progressRoutes, { prefix: '/api' });
  await app.register(studyRoutes, { prefix: '/api', cardGenerator: options.cardGenerator });
  await app.register(teacherRoutes, { prefix: '/api', cardGenerator: options.cardGenerator });
  await app.register(liveRoomRoutes, {
    prefix: '/api',
    corsOrigins: options.corsOrigins,
    hooks: options.liveRoomHooks,
  });

  return app;
};
