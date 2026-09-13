import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponse } from '../../shared/http/errors.js';
import { studentHeader, teacherHeader } from '../../shared/http/identity.js';
import type { LiveRoomGateway } from './live-room.gateway.js';
import { createLiveRoomGateway } from './live-room.gateway.js';
import { createLiveRoomRepository } from './live-room.repository.js';
import {
  answerAccepted,
  answerBody,
  createRoomBody,
  joinRoomBody,
  participant,
  room,
  roomParams,
  roomQuestion,
} from './live-room.schemas.js';
import { createLiveRoomService, type LiveRoomHooks } from './live-room.service.js';

export interface LiveRoomRoutesOptions {
  corsOrigins?: string[] | undefined;
  hooks?: LiveRoomHooks | undefined;
  gateway?: LiveRoomGateway | undefined;
}

// Limite por device, não por endereço: os 40 alunos de uma turma saem pelo mesmo NAT da escola.
// Força bruta de PIN vem de um device repetindo tentativa, e é isso que este limite corta.
const JOIN_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  keyGenerator: (request: { body?: unknown; ip: string }): string => {
    const guestKey = (request.body as { guestKey?: unknown } | undefined)?.guestKey;
    return typeof guestKey === 'string' ? guestKey : request.ip;
  },
};

export const liveRoomRoutes: FastifyPluginAsyncZod<LiveRoomRoutesOptions> = async (
  app,
  options,
) => {
  const service = createLiveRoomService(createLiveRoomRepository(app.db), options.hooks ?? {});
  const gateway =
    options.gateway ?? createLiveRoomGateway(app, service, options.corsOrigins ?? []);

  app.addHook('onClose', async () => {
    if (!options.gateway) await gateway.close();
  });

  app.post(
    '/rooms',
    {
      schema: {
        tags: ['live-room'],
        summary: 'Professor cria uma sala com PIN e as perguntas escolhidas.',
        headers: teacherHeader,
        body: createRoomBody,
        response: { 201: room },
      },
    },
    async (request, reply) => {
      const created = await service.createRoom(request.headers['x-teacher-id'], request.body);
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/rooms/join',
    {
      config: { rateLimit: JOIN_RATE_LIMIT },
      schema: {
        tags: ['live-room'],
        summary: 'Aluno entra na sala pelo PIN. Sala encerrada ou expirada recusa a entrada.',
        body: joinRoomBody,
        response: { 200: participant, 404: errorResponse, 409: errorResponse },
      },
    },
    async (request) => service.join(request.body, new Date()),
  );

  app.post(
    '/rooms/:roomId/start',
    {
      schema: {
        tags: ['live-room'],
        summary: 'Coloca a primeira pergunta no ar.',
        headers: teacherHeader,
        params: roomParams,
        response: { 200: roomQuestion, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    async (request) => {
      const started = await service.start(
        request.headers['x-teacher-id'],
        request.params.roomId,
      );
      gateway.publishQuestion(started.room.pin, started.question);
      return started.question;
    },
  );

  app.post(
    '/rooms/:roomId/next',
    {
      schema: {
        tags: ['live-room'],
        summary: 'Avança para a próxima pergunta; na última, encerra a sala.',
        headers: teacherHeader,
        params: roomParams,
        response: {
          200: roomQuestion.nullable(),
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (request) => {
      const advanced = await service.advance(
        request.headers['x-teacher-id'],
        request.params.roomId,
      );
      if (advanced.question) {
        gateway.publishQuestion(advanced.room.pin, advanced.question);
      } else {
        gateway.publishClosed(advanced.room.pin);
      }
      return advanced.question;
    },
  );

  app.post(
    '/rooms/:roomId/close',
    {
      schema: {
        tags: ['live-room'],
        summary: 'Encerra a sala. Depois disso ela recusa entrada e resposta.',
        headers: teacherHeader,
        params: roomParams,
        response: { 200: room, 404: errorResponse },
      },
    },
    async (request) => {
      const closed = await service.close(request.headers['x-teacher-id'], request.params.roomId);
      gateway.publishClosed(closed.pin);
      return closed;
    },
  );

  app.post(
    '/rooms/answers',
    {
      schema: {
        tags: ['live-room'],
        summary: 'Registra a resposta do participante. Reenvio não duplica.',
        headers: studentHeader.partial(),
        body: answerBody,
        response: { 200: answerAccepted, 404: errorResponse, 409: errorResponse },
      },
    },
    async (request) => service.answer(request.body),
  );
};
