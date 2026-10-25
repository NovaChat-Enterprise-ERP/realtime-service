import type { Server } from 'socket.io';
import type { Logger } from '@novachat-enterprise-erp/common';
import type { AccessDirectory } from './providers/access-directory.js';
import type { PresenceRepository } from './repositories/presence.repository.js';
import { ConnectionService } from './services/connection.service.js';
import { PresenceService } from './services/presence.service.js';
import { FanoutService } from './services/fanout.service.js';
import { SocketIoEmitter } from './services/realtime-emitter.js';
import { registerSocketGateway } from './gateway/socket-gateway.js';

export interface ContainerDeps {
  io: Server;
  logger: Logger;
  internalSecret: string;
  directory: AccessDirectory;
  presence: PresenceRepository;
}

export const buildContainer = (deps: ContainerDeps) => {
  const emitter = new SocketIoEmitter(deps.io);
  const services = {
    connections: new ConnectionService(deps.directory, deps.internalSecret),
    presence: new PresenceService(deps.presence, emitter),
    fanout: new FanoutService(emitter),
  };
  registerSocketGateway(deps.io, services.connections, services.presence, deps.logger);
  return { services };
};
