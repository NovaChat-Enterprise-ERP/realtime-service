import type { Server, Socket } from 'socket.io';
import { AppError, type Logger } from '@novachat-enterprise-erp/common';
import { CLIENT_EVENTS, SOCKET_EVENTS, type TypingPayload } from '@novachat-enterprise-erp/contracts';
import type { ConnectionService, SocketIdentity } from '../services/connection.service.js';
import type { PresenceService } from '../services/presence.service.js';
import { rooms } from '../services/rooms.js';

type AuthedSocket = Socket & { data: { identity: SocketIdentity } };

const TYPING_THROTTLE_MS = 2_000;

export const registerSocketGateway = (
  io: Server,
  connections: ConnectionService,
  presence: PresenceService,
  logger: Logger,
): void => {
  io.use(async (socket, next) => {
    try {
      const workspaceId = socket.handshake.auth?.workspaceId ?? socket.handshake.query.workspaceId;
      const identity = await connections.authenticate(socket.handshake.headers, workspaceId);
      socket.data.identity = identity;
      await socket.join(await connections.initialRooms(identity));
      next();
    } catch (error) {
      const err = new Error(error instanceof AppError ? error.message : 'Unauthorized') as Error & { data?: unknown };
      err.data = { code: error instanceof AppError ? error.code : 'UNAUTHORIZED' };
      next(err);
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as AuthedSocket;
    const identity = socket.data.identity;
    const lastTyping = new Map<string, number>();

    presence.connected(identity).catch((error) => logger.warn({ err: error, userId: identity.userId }, 'Presence update failed'));

    socket.on(CLIENT_EVENTS.TYPING, (payload: TypingPayload) => {
      if (!payload?.conversationId) return;
      const room = rooms.conversation(payload.conversationId);
      if (!socket.rooms.has(room)) return;
      const key = `${payload.conversationId}:${payload.parentId ?? ''}`;
      const now = Date.now();
      if (now - (lastTyping.get(key) ?? 0) < TYPING_THROTTLE_MS) return;
      lastTyping.set(key, now);
      socket.to(room).emit(SOCKET_EVENTS.TYPING, {
        conversationId: payload.conversationId,
        parentId: payload.parentId ?? null,
        userId: identity.userId,
      });
    });

    socket.on(CLIENT_EVENTS.PRESENCE_HEARTBEAT, () => void presence.heartbeat(identity).catch(() => undefined));

    socket.on(CLIENT_EVENTS.PRESENCE_QUERY, async (userIds: unknown, ack?: (online: string[]) => void) => {
      if (typeof ack !== 'function' || !Array.isArray(userIds)) return;
      ack(await presence.online(identity.workspaceId, userIds.filter((u): u is string => typeof u === 'string')));
    });

    socket.on('conversation:subscribe', async (conversationId: string, ack?: (ok: boolean) => void) => {
      const ok = await connections.canJoinConversation(identity, conversationId).catch(() => false);
      if (ok) await socket.join(rooms.conversation(conversationId));
      if (typeof ack === 'function') ack(ok);
    });

    socket.on('disconnect', () => void presence.disconnected(identity).catch(() => undefined));
  });
};
