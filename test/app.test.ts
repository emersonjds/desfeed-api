import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';

const unreachable = createDatabase('postgres://desfeed:desfeed@127.0.0.1:1/desfeed');
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db: unreachable.db, logLevel: 'silent' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await unreachable.pool.end();
});

describe('app configurado para produção', () => {
  it('usa a URL pública e a allowlist de CORS', async () => {
    const configured = await buildApp({
      db: unreachable.db,
      corsOrigins: ['https://painel.memfeed.app'],
      publicUrl: 'https://api.memfeed.app',
      logLevel: 'silent',
    });
    await configured.ready();
    expect(configured.swagger().servers?.[0]?.url).toBe('https://api.memfeed.app');

    const blocked = await configured.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    await configured.close();
  });
});

describe('app', () => {
  it('publica o OpenAPI com as rotas documentadas', () => {
    const document = app.swagger();
    expect(document.info.title).toBe('Memfeed API');
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining(['/health', '/api/notebooks', '/api/notebooks/{notebookId}']),
    );
    expect(document.paths?.['/api/notebooks']?.post?.summary).toBeTruthy();
  });

  it('reporta o banco como down sem derrubar o serviço', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'down' });
  });

  it('recusa requisição sem o header de aluno', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/notebooks' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation_error');
  });

  it('recusa payload inválido na criação de caderno', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: { 'x-student-id': '11111111-1111-4111-8111-111111111111' },
      payload: { title: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('responde 500 sem vazar detalhe quando o banco está fora', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: { 'x-student-id': '11111111-1111-4111-8111-111111111111' },
      payload: { title: 'Biologia', subject: 'Ciências' },
    });
    expect(created.statusCode).toBe(500);
    expect(created.json()).toEqual({ error: 'internal_error', message: 'Erro interno.' });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/notebooks',
      headers: { 'x-student-id': '11111111-1111-4111-8111-111111111111' },
    });
    expect(listed.statusCode).toBe(500);
  });

  it('devolve o status do Fastify para erro de cliente conhecido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: {
        'x-student-id': '11111111-1111-4111-8111-111111111111',
        'content-type': 'application/json',
      },
      payload: '{',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('FST_ERR_CTP_INVALID_JSON_BODY');
  });

  it('serve o contrato OpenAPI em /swagger/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/swagger/json' });
    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBeTruthy();
  });
});
