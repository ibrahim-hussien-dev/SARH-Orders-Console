import type { Database } from 'better-sqlite3';
import { Router } from 'express';
import type { AppConfig } from '../config';
import { fromZod } from '../http/errors';
import { clearCookieOptions, SESSION_COOKIE_NAME, sessionCookieOptions } from './auth.cookie';
import { unauthenticatedError } from './auth.errors';
import { createAuthMiddleware } from './auth.middleware';
import { createLoginRateLimiter } from './auth.rate-limit';
import { createAuthRepository } from './auth.repository';
import { loginSchema } from './auth.schemas';
import { createAuthService } from './auth.service';

export function createAuthRouter(db: Database, config: AppConfig): Router {
  const router = Router();
  const auth = createAuthMiddleware(config);
  const service = createAuthService(createAuthRepository(db), config.jwtSecret);

  router.post('/login', createLoginRateLimiter(config), async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fromZod(parsed.error);
      }
      const { user, token } = await service.login(parsed.data.email, parsed.data.password);
      res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(config));
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(config));
    res.status(204).end();
  });

  router.get('/me', auth.requireAuth, (req, res, next) => {
    try {
      if (!req.user) {
        throw unauthenticatedError();
      }
      res.status(200).json({ user: service.getCurrentUser(req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
