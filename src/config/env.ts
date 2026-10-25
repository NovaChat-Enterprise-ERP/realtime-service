import { z } from 'zod';
import { baseEnvSchema, loadEnv, serviceUrl } from '@novachat-enterprise-erp/common';

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(4004),
  REDIS_URL: z.string().min(1),
  WORKSPACE_SERVICE_URL: serviceUrl('http://localhost:4002'),
  MESSAGE_SERVICE_URL: serviceUrl('http://localhost:4003'),
  PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof schema>;

export const loadRealtimeEnv = (): Env => loadEnv(schema);
