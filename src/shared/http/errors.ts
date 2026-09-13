import { z } from 'zod';

export const errorResponse = z.object({
  error: z.string(),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponse>;

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message: string): HttpError => new HttpError(404, 'not_found', message);

export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);

const databaseViolations: Record<string, { statusCode: number; error: string; message: string }> = {
  '23503': {
    statusCode: 422,
    error: 'invalid_reference',
    message: 'Referência inexistente para este recurso.',
  },
  '23505': { statusCode: 409, error: 'conflict', message: 'Recurso já existe.' },
};

// Drizzle embrulha o erro do pg em DrizzleQueryError; o código do Postgres fica no `cause`.
export const asDatabaseHttpError = (error: unknown): HttpError | undefined => {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code !== 'string') continue;
    const violation = databaseViolations[code];
    if (violation) return new HttpError(violation.statusCode, violation.error, violation.message);
  }
  return undefined;
};
