import express, { type Express } from 'express';
import { healthRouter } from '@novachat-enterprise-erp/common';

export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(healthRouter('realtime-service'));
  return app;
};
