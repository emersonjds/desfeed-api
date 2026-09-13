import 'dotenv/config';
import { z } from 'zod';

// Railway entrega variável não preenchida como string vazia, não como ausente.
const blankAsUndefined = <Schema extends z.ZodTypeAny>(schema: Schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform(
      (value) =>
        value
          ?.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean) ?? [],
    ),
  PUBLIC_URL: blankAsUndefined(z.string().url().optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ANTHROPIC_API_KEY: blankAsUndefined(z.string().min(1).optional()),
  GEMINI_API_KEY: blankAsUndefined(z.string().min(1).optional()),
  GEMINI_MODEL: blankAsUndefined(z.string().min(1).optional()),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
};
