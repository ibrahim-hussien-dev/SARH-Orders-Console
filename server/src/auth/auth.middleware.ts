import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { HttpError } from '../http/errors';
import { SESSION_COOKIE_NAME } from './auth.cookie';
import { unauthenticatedError } from './auth.errors';
import { verifyToken } from './auth.tokens';
import type { UserRole } from './auth.types';

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  requireRole(role: UserRole): RequestHandler;
}

export function createAuthMiddleware(config: AppConfig): AuthMiddleware {
  const requireAuth: RequestHandler = (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || token.length === 0) {
      next(unauthenticatedError());
      return;
    }
    const user = verifyToken(token, config.jwtSecret);
    if (!user) {
      next(unauthenticatedError());
      return;
    }
    req.user = user;
    next();
  };

  function requireRole(role: UserRole): RequestHandler {
    return (req, _res, next) => {
      if (!req.user) {
        next(unauthenticatedError());
        return;
      }
      if (req.user.role !== role) {
        next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
        return;
      }
      next();
    };
  }

  return { requireAuth, requireRole };
}
