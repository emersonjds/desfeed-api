import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { HttpError } from '../../shared/http/errors.js';
import type { LiveRoomService } from './live-room.service.js';
import { answerBody, type RoomQuestion } from './live-room.schemas.js';

export interface LiveRoomGateway {
  publishQuestion: (pin: string, question: RoomQuestion) => void;
  publishClosed: (pin: string) => void;
  close: () => Promise<void>;
}

interface SocketAuth {
  pin?: unknown;
  participantId?: unknown;
}

const authOf = (socket: Socket): SocketAuth => (socket.handshake.auth ?? {}) as SocketAuth;

export const createLiveRoomGateway = (
  app: FastifyInstance,
  service: LiveRoomService,
  corsOrigins: string[],
): LiveRoomGateway => {
  const io = new Server(app.server, {
    cors: { origin: corsOrigins.length > 0 ? corsOrigins : true },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const { pin } = authOf(socket);
    if (typeof pin !== 'string' || pin.length !== 6) {
      next(new Error('PIN inválido.'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    const { pin } = authOf(socket);
    void socket.join(String(pin));

    socket.on('room:answer', async (payload: unknown, ack?: (result: unknown) => void) => {
      const parsed = answerBody.safeParse(payload);
      if (!parsed.success) {
        ack?.({ error: 'invalid_payload' });
        return;
      }
      // Autorização por evento: o participantId do payload precisa existir e pertencer à sala.
      try {
        const result = await service.answer(parsed.data);
        ack?.(result);
        io.to(String(pin)).emit('room:answered', { cardId: parsed.data.cardId });
      } catch (error) {
        ack?.({
          error: error instanceof HttpError ? error.error : 'answer_failed',
          message: error instanceof Error ? error.message : 'Falha ao registrar resposta.',
        });
      }
    });
  });

  return {
    publishQuestion: (pin, question) => io.to(pin).emit('room:question', question),
    publishClosed: (pin) => io.to(pin).emit('room:closed', { pin }),
    close: async () => {
      await io.close();
    },
  };
};
