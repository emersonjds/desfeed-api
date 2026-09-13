import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('aplica defaults e divide CORS_ORIGINS', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://localhost:5432/desfeed',
      CORS_ORIGINS: 'https://a.app, https://b.app',
    });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['https://a.app', 'https://b.app']);
  });

  it('trata variável opcional em branco como ausente', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://localhost:5432/desfeed',
      PUBLIC_URL: '',
      ANTHROPIC_API_KEY: '',
    });
    expect(env.PUBLIC_URL).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('rejeita PUBLIC_URL malformada', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgres://localhost:5432/desfeed', PUBLIC_URL: 'nao-e-url' }),
    ).toThrow(/PUBLIC_URL/);
  });

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
