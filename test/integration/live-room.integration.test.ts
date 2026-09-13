import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { students, teachers } from '../../src/db/schema.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const content = {
  keyTerm: 'Ciclo de Carnot',
  highlightTerm: 'rendimento máximo',
  options: [
    { id: 'A', label: 'n = 1 - T2/T1' },
    { id: 'B', label: 'n = T1 + T2' },
    { id: 'C', label: 'n = Q1 / Q2' },
    { id: 'D', label: 'n = 0' },
  ],
  correctOptionId: 'A',
  imageUrl: null,
};

const waitFor = <T>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

describe.skipIf(!connectionString)('sala ao vivo contra o Postgres', () => {
  const { db, pool } = createDatabase(connectionString ?? '');
  const sockets: Socket[] = [];
  let app: FastifyInstance;
  let baseUrl = '';
  let studentId = '';
  let teacherId = '';
  let cardIds: string[] = [];
  const asStudent = { 'x-student-id': '' };
  const asTeacher = { 'x-teacher-id': '' };

  beforeAll(async () => {
    app = await buildApp({ db, logLevel: 'silent' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const [student] = await db.insert(students).values({ displayName: 'Júlia' }).returning();
    const [teacher] = await db.insert(teachers).values({ displayName: 'Marcos' }).returning();
    studentId = student?.id ?? '';
    teacherId = teacher?.id ?? '';
    asStudent['x-student-id'] = studentId;
    asTeacher['x-teacher-id'] = teacherId;

    const notebook = await app.inject({
      method: 'POST',
      url: '/api/notebooks',
      headers: asStudent,
      payload: { title: 'Física II' },
    });
    const theme = await app.inject({
      method: 'POST',
      url: `/api/notebooks/${notebook.json().id}/themes`,
      headers: asStudent,
      payload: { title: 'Termodinâmica' },
    });

    const created = await Promise.all(
      ['Pergunta 1', 'Pergunta 2'].map((question) =>
        app.inject({
          method: 'POST',
          url: `/api/themes/${theme.json().id}/cards`,
          headers: asTeacher,
          payload: { ...content, question },
        }),
      ),
    );
    cardIds = created.map((response) => response.json().id);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await db.execute(sql`delete from students where id = ${studentId}`);
    await db.execute(sql`delete from teachers where id = ${teacherId}`);
    await app.close();
    await pool.end();
  });

  const openRoom = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: asTeacher,
      payload: { title: 'Revisão ao vivo', cardIds, durationMinutes: 30 },
    });
    return response.json();
  };

  const join = (pin: string, guestKey: string) =>
    app.inject({
      method: 'POST',
      url: '/api/rooms/join',
      payload: { pin, displayName: 'Aluno', guestKey },
    });

  it('40 alunos entram e recebem a pergunta quando o professor começa', async () => {
    const room = await openRoom();
    expect(room.pin).toMatch(/^\d{6}$/);

    const participants = await Promise.all(
      Array.from({ length: 40 }, (_, index) => join(room.pin, `device-${index}`)),
    );
    expect(participants.every((response) => response.statusCode === 200)).toBe(true);

    const connections = participants.map(() =>
      connect(baseUrl, { auth: { pin: room.pin }, transports: ['websocket'] }),
    );
    sockets.push(...connections);
    await Promise.all(
      connections.map(
        (socket) => new Promise<void>((resolve) => socket.on('connect', () => resolve())),
      ),
    );

    const questions = connections.map((socket) => waitFor<{ cardId: string }>(socket, 'room:question'));
    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/start`,
      headers: asTeacher,
    });
    expect(started.statusCode).toBe(200);

    const received = await Promise.all(questions);
    expect(received).toHaveLength(40);
    expect(received.every((question) => question.cardId === cardIds[0])).toBe(true);
  });

  it('resposta por socket é aceita uma vez e reconexão não duplica', async () => {
    const room = await openRoom();
    const participant = (await join(room.pin, 'device-unico')).json();
    await app.inject({ method: 'POST', url: `/api/rooms/${room.id}/start`, headers: asTeacher });

    const socket = connect(baseUrl, { auth: { pin: room.pin }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    const payload = {
      participantId: participant.participantId,
      cardId: cardIds[0],
      optionId: 'A',
      answeredAt: new Date().toISOString(),
    };

    const first = await socket.emitWithAck('room:answer', payload);
    expect(first).toEqual({ correct: true, alreadyAnswered: false });

    socket.disconnect();
    const reconnected = connect(baseUrl, { auth: { pin: room.pin }, transports: ['websocket'] });
    sockets.push(reconnected);
    await new Promise<void>((resolve) => reconnected.on('connect', () => resolve()));

    const second = await reconnected.emitWithAck('room:answer', { ...payload, optionId: 'B' });
    expect(second).toEqual({ correct: true, alreadyAnswered: true });
  });

  it('sala encerrada recusa entrada e resposta tardia', async () => {
    const room = await openRoom();
    const participant = (await join(room.pin, 'device-tardio')).json();
    await app.inject({ method: 'POST', url: `/api/rooms/${room.id}/start`, headers: asTeacher });
    await app.inject({ method: 'POST', url: `/api/rooms/${room.id}/close`, headers: asTeacher });

    const late = await app.inject({
      method: 'POST',
      url: '/api/rooms/answers',
      payload: {
        participantId: participant.participantId,
        cardId: cardIds[0],
        optionId: 'A',
        answeredAt: new Date().toISOString(),
      },
    });
    expect(late.statusCode).toBe(409);

    const blocked = await join(room.pin, 'device-atrasado');
    expect(blocked.statusCode).toBe(409);
  });

  it('socket recusa payload malformado e resposta inválida com erro nomeado', async () => {
    const room = await openRoom();
    await join(room.pin, 'device-malformado');
    const socket = connect(baseUrl, { auth: { pin: room.pin }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    await expect(socket.emitWithAck('room:answer', { cardId: 'nao-e-uuid' })).resolves.toEqual({
      error: 'invalid_payload',
    });

    const orphan = await socket.emitWithAck('room:answer', {
      participantId: '99999999-9999-4999-8999-999999999999',
      cardId: cardIds[0],
      optionId: 'A',
      answeredAt: new Date().toISOString(),
    });
    expect(orphan).toMatchObject({ error: 'not_found' });
  });

  it('socket sem PIN válido não conecta', async () => {
    const socket = connect(baseUrl, { auth: {}, transports: ['websocket'] });
    sockets.push(socket);
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('PIN inválido.');
  });

  it('avançar até o fim encerra a sala e avisa quem está conectado', async () => {
    const room = await openRoom();
    await join(room.pin, 'device-final');
    const socket = connect(baseUrl, { auth: { pin: room.pin }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    await app.inject({ method: 'POST', url: `/api/rooms/${room.id}/start`, headers: asTeacher });
    const closed = waitFor<{ pin: string }>(socket, 'room:closed');

    const second = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/next`,
      headers: asTeacher,
    });
    expect(second.json().cardId).toBe(cardIds[1]);

    const last = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/next`,
      headers: asTeacher,
    });
    expect(last.json()).toBeNull();
    await expect(closed).resolves.toMatchObject({ pin: room.pin });
  });
});
