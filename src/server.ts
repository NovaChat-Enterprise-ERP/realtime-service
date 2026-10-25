import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { InternalHttpClient, createLogger, startServer } from '@novachat-enterprise-erp/common';
import { RedisStreamEventSubscriber } from '@novachat-enterprise-erp/events';
import { loadRealtimeEnv } from './config/env.js';
import { ServiceAccessDirectory } from './providers/access-directory.js';
import { RedisPresenceRepository } from './repositories/presence.repository.js';
import { registerConsumers } from './events/consumers.js';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

const env = loadRealtimeEnv();
const logger = createLogger('realtime-service', env.LOG_LEVEL);
const pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, keepAlive: 15_000 });
const sub = pub.duplicate();
const store = pub.duplicate();
for (const client of [pub, sub, store]) {
  client.on('error', (err) => logger.warn({ err: err.message }, 'Redis connection error; reconnecting'));
}
const client = (url: string) => new InternalHttpClient(url, env.INTERNAL_SECRET, 'realtime-service');

const io = new Server({
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: env.PUBLIC_APP_URL, credentials: true },
  adapter: createAdapter(pub, sub),
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

const { services } = buildContainer({
  io,
  logger,
  internalSecret: env.INTERNAL_SECRET,
  directory: new ServiceAccessDirectory(client(env.WORKSPACE_SERVICE_URL), client(env.MESSAGE_SERVICE_URL)),
  presence: new RedisPresenceRepository(store),
});

const subscriber = new RedisStreamEventSubscriber({
  redisUrl: env.REDIS_URL,
  source: 'realtime-service',
  group: 'realtime-service',
  blockMs: 5_000,
  logger,
});
registerConsumers(subscriber, services.fanout);
await subscriber.start();

startServer({
  app: createApp(),
  port: env.PORT,
  logger,
  configure: (server) => io.attach(server),
  onShutdown: [
    () => subscriber.stop(),
    () => new Promise<void>((resolve) => io.close(() => resolve())),
    async () => void (await Promise.allSettled([pub.quit(), sub.quit(), store.quit()])),
  ],
});
