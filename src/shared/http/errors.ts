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

export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);
