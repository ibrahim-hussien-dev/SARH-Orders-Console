import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../config';
import { HttpError } from '../http/errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

export function createLoginRateLimiter(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_FAILED_ATTEMPTS,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.nodeEnv === 'test',
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.'));
    },
  });
}
