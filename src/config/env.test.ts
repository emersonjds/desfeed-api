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

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
