import type { CookieOptions } from 'express';
import type { AppConfig } from '../config';

export const SESSION_COOKIE_NAME = 'token';

const SESSION_TTL_SECONDS = 15 * 60;

export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function clearCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
  };
}
