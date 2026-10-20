import type { Database } from 'better-sqlite3';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../../auth/auth.middleware';
import { fromZod } from '../../http/errors';
import { createDeleteRepository } from './delete.repository';
import { createDeleteService } from './delete.service';

const orderIdSchema = z.string().regex(/^[1-9]\d{0,14}$/, 'id must be a positive integer');

export function createDeleteRouter(db: Database, auth: AuthMiddleware): Router {
  const router = Router();
  const service = createDeleteService(createDeleteRepository(db));

  router.delete('/:id', auth.requireRole('admin'), (req, res, next) => {
    try {
      const parsed = orderIdSchema.safeParse(req.params.id);
      if (!parsed.success) {
        throw fromZod(parsed.error);
      }
      service.deleteOrder(Number(parsed.data));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
