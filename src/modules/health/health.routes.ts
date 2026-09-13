import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const healthResponse = z.object({
  status: z.literal('ok'),
  database: z.enum(['up', 'down']),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness do serviço e da conexão com o Postgres.',
        response: { 200: healthResponse },
      },
    },
    async () => {
      const database = await app.db
        .execute(sql`select 1`)
        .then(() => 'up' as const)
        .catch(() => 'down' as const);
      return { status: 'ok' as const, database };
    },
  );
};
