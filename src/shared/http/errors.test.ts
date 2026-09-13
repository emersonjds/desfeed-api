import { describe, expect, it } from 'vitest';
import { asDatabaseHttpError, conflict, HttpError } from './errors.js';

describe('asDatabaseHttpError', () => {
  it('traduz violação de chave estrangeira em 422', () => {
    expect(asDatabaseHttpError({ code: '23503' })).toMatchObject({ statusCode: 422 });
  });

  it('traduz violação de unicidade em 409', () => {
    expect(asDatabaseHttpError({ code: '23505' })).toMatchObject({ statusCode: 409 });
  });

  it('encontra o código do Postgres embrulhado pelo Drizzle', () => {
    const wrapped = Object.assign(new Error('query failed'), { cause: { code: '23503' } });
    expect(asDatabaseHttpError(wrapped)).toMatchObject({ statusCode: 422 });
  });

  it('ignora erro que não é do Postgres', () => {
    expect(asDatabaseHttpError(new Error('boom'))).toBeUndefined();
    expect(asDatabaseHttpError({ code: 'FST_ERR_VALIDATION' })).toBeUndefined();
  });
});

describe('conflict', () => {
  it('monta um HttpError 409', () => {
    const error = conflict('já existe');
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(409);
  });
});
