import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { HttpError } from '../../http/errors';
import { createOrderRepository } from './create.repository';
import { parseCreateOrderBody, parseIdempotencyKey } from './create.schema';
import { createOrderService } from './create.service';

export function createCreateRouter(db: Database): Router {
  const service = createOrderService(db, createOrderRepository(db));
  const router = Router();

  router.post('/', (req, res) => {
    const user = req.user;
    if (user === undefined) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const key = parseIdempotencyKey(req.header('Idempotency-Key'));
    const input = parseCreateOrderBody(req.body);
    const { order, replayed } = service.create(user.id, key, input);
    if (replayed) {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(200).json({ order });
      return;
    }
    res.status(201).json({ order });
  });

  return router;
}
