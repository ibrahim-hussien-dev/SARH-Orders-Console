import express from 'express';
import cookieParser from 'cookie-parser';
import type { Database } from 'better-sqlite3';
import type { AppConfig } from './config';
import { createAuthMiddleware } from './auth/auth.middleware';
import { createAuthRouter } from './auth/auth.routes';
import { createListRouter } from './orders/list/list.routes';
import { createCreateRouter } from './orders/create/create.routes';
import { createDeleteRouter } from './orders/delete/delete.routes';
import { errorHandler, notFoundHandler } from './http/errors';

export function createApp(db: Database, config: AppConfig): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  const auth = createAuthMiddleware(config);
  app.use('/api/auth', createAuthRouter(db, config));
  app.use('/api/orders', auth.requireAuth,
    createListRouter(db, config), createCreateRouter(db), createDeleteRouter(db, auth));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
