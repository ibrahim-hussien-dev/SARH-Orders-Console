import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import type { AppConfig } from '../../config';
import { parseListQuery } from './list.schema';
import { listOrders } from './list.service';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createListRouter(db: Database, config: AppConfig): Router {
  const router = Router();
  const delayEnabled = config.nodeEnv !== 'production';

  router.get('/', async (req, res, next) => {
    try {
      const query = parseListQuery(req.query, delayEnabled);
      const page = listOrders(db, query);
      if (query.delayMs !== undefined) {
        await delay(query.delayMs);
      }
      res.json(page);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
