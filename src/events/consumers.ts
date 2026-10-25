import type { EventSubscriber } from '@novachat-enterprise-erp/events';
import type { FanoutService } from '../services/fanout.service.js';

export const registerConsumers = (subscriber: EventSubscriber, fanout: FanoutService): void => {
  for (const type of fanout.handles) subscriber.on(type, (event) => fanout.handle(event));
};
