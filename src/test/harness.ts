import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { ConversationAccessDto, WorkspaceAccessDto } from '@novachat-enterprise-erp/contracts';
import { createLogger } from '@novachat-enterprise-erp/common';
import { InMemoryEventBus } from '@novachat-enterprise-erp/events';
import { TEST_SECRET, asUser } from '@novachat-enterprise-erp/testing';
import type { AccessDirectory } from '../providers/access-directory.js';
import { MemoryPresenceRepository } from '../repositories/presence.repository.js';
import { registerConsumers } from '../events/consumers.js';
import { buildContainer } from '../container.js';

export const WS = '00000000-0000-4000-8000-0000000000aa';
export const CONV = '00000000-0000-4000-8000-0000000000c1';

export class FakeDirectory implements AccessDirectory {
  members = new Set(['ada', 'grace', 'linus']);
  deactivated = new Set<string>();
  conversations = new Map<string, string[]>([[CONV, ['ada', 'grace']]]);

  async workspaceAccess(workspaceId: string, userId: string): Promise<WorkspaceAccessDto | null> {
    if (workspaceId !== WS || !this.members.has(userId)) return null;
    return { workspaceId, memberId: `m-${userId}`, role: 'member', permissions: [], deactivated: this.deactivated.has(userId) };
  }

  async conversationIds(_workspaceId: string, userId: string) {
    return [...this.conversations].filter(([, users]) => users.includes(userId)).map(([id]) => id);
  }

  async conversationAccess(conversationId: string, userId: string): Promise<ConversationAccessDto | null> {
    const users = this.conversations.get(conversationId);
    if (!users) return null;
    return { conversationId, workspaceId: WS, type: 'public_channel', isMember: users.includes(userId) };
  }
}

export const createHarness = async () => {
  const httpServer = createServer();
  const io = new Server(httpServer, { transports: ['websocket'] });
  const directory = new FakeDirectory();
  const events = new InMemoryEventBus('test');
  const { services } = buildContainer({
    io,
    logger: createLogger('test', 'silent'),
    internalSecret: TEST_SECRET,
    directory,
    presence: new MemoryPresenceRepository(),
  });
  registerConsumers(events, services.fanout);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  const client = (userId: string, workspaceId = WS, signed = true) => {
    const socket = connect(url, {
      transports: ['websocket'],
      auth: { workspaceId },
      extraHeaders: signed ? asUser({ userId }) : {},
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  };

  const connected = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => setTimeout(resolve, 30));
      socket.once('connect_error', reject);
    });

  const close = async () => {
    sockets.forEach((s) => s.disconnect());
    io.close();
    await new Promise((r) => httpServer.close(r));
  };

  return { client, connected, events, directory, close };
};

export const nextEvent = <T>(socket: Socket, event: string, timeoutMs = 1_000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

export const noEvent = (socket: Socket, event: string, waitMs = 150) =>
  new Promise<boolean>((resolve) => {
    const handler = () => resolve(false);
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve(true);
    }, waitMs);
  });
