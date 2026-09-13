import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import {
  createAnthropicGenerator,
  createGeminiGenerator,
  type CardGenerator,
} from './modules/ingestion/card-generator.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

const resolveGenerator = (): CardGenerator | undefined => {
  if (env.ANTHROPIC_API_KEY) return createAnthropicGenerator(env.ANTHROPIC_API_KEY);
  if (env.GEMINI_API_KEY) return createGeminiGenerator(env.GEMINI_API_KEY);
  return undefined;
};

const cardGenerator = resolveGenerator();
const app = await buildApp({
  db,
  ...(cardGenerator ? { cardGenerator } : {}),
  corsOrigins: env.CORS_ORIGINS,
  ...(env.PUBLIC_URL ? { publicUrl: env.PUBLIC_URL } : {}),
  logLevel: env.LOG_LEVEL,
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
