import type { Redis } from 'ioredis';

export interface PresenceRepository {
  markOnline(workspaceId: string, userId: string, ttlSeconds: number): Promise<void>;
  markOffline(workspaceId: string, userId: string): Promise<void>;
  onlineAmong(workspaceId: string, userIds: string[]): Promise<string[]>;
}

const key = (workspaceId: string, userId: string) => `novachat:presence:${workspaceId}:${userId}`;

export class RedisPresenceRepository implements PresenceRepository {
  constructor(private readonly redis: Redis) {}

  async markOnline(workspaceId: string, userId: string, ttlSeconds: number) {
    await this.redis.set(key(workspaceId, userId), '1', 'EX', ttlSeconds);
  }

  async markOffline(workspaceId: string, userId: string) {
    await this.redis.del(key(workspaceId, userId));
  }

  async onlineAmong(workspaceId: string, userIds: string[]) {
    if (userIds.length === 0) return [];
    const values = await this.redis.mget(...userIds.map((u) => key(workspaceId, u)));
    return userIds.filter((_, i) => values[i] !== null);
  }
}

export class MemoryPresenceRepository implements PresenceRepository {
  private readonly online = new Map<string, number>();

  async markOnline(workspaceId: string, userId: string, ttlSeconds: number) {
    this.online.set(key(workspaceId, userId), Date.now() + ttlSeconds * 1000);
  }

  async markOffline(workspaceId: string, userId: string) {
    this.online.delete(key(workspaceId, userId));
  }

  async onlineAmong(workspaceId: string, userIds: string[]) {
    return userIds.filter((u) => (this.online.get(key(workspaceId, u)) ?? 0) > Date.now());
  }
}
