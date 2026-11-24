import express from 'express';
import { getDb } from './db/database.ts';
import { createApiRouter } from './routes.ts';

export function createApp() {
  const app = express();

  getDb();

  app.use(express.json({ limit: '12mb' }));
  app.use('/api', createApiRouter());

  return app;
}
