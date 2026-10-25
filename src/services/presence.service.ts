import { SOCKET_EVENTS } from '@novachat-enterprise-erp/contracts';
import type { PresenceRepository } from '../repositories/presence.repository.js';
import type { RealtimeEmitter } from './realtime-emitter.js';
import type { SocketIdentity } from './connection.service.js';
import { rooms } from './rooms.js';

export const PRESENCE_TTL_SECONDS = 90;

export class PresenceService {
  constructor(
    private readonly presence: PresenceRepository,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async connected({ workspaceId, userId }: SocketIdentity): Promise<void> {
    await this.presence.markOnline(workspaceId, userId, PRESENCE_TTL_SECONDS);
    this.emitter.emit(rooms.workspace(workspaceId), SOCKET_EVENTS.PRESENCE_UPDATED, { userId, online: true });
  }

  async heartbeat({ workspaceId, userId }: SocketIdentity): Promise<void> {
    await this.presence.markOnline(workspaceId, userId, PRESENCE_TTL_SECONDS);
  }

  async disconnected({ workspaceId, userId }: SocketIdentity): Promise<void> {
    if ((await this.emitter.countSockets(rooms.user(workspaceId, userId))) > 0) return;
    await this.presence.markOffline(workspaceId, userId);
    this.emitter.emit(rooms.workspace(workspaceId), SOCKET_EVENTS.PRESENCE_UPDATED, { userId, online: false });
  }

  online(workspaceId: string, userIds: string[]): Promise<string[]> {
    return this.presence.onlineAmong(workspaceId, userIds.slice(0, 500));
  }
}
