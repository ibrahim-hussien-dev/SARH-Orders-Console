import jwt from 'jsonwebtoken';
import type { AuthenticatedUser } from './auth.types';

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d{0,14}$/;

export function signToken(user: AuthenticatedUser, secret: string): string {
  return jwt.sign({ role: user.role }, secret, {
    subject: String(user.id),
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}

export function verifyToken(token: string, secret: string): AuthenticatedUser | null {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (typeof payload === 'string' || typeof payload.exp !== 'number') {
    return null;
  }
  const subject: unknown = payload.sub;
  const role: unknown = payload.role;
  if (typeof subject !== 'string' || !POSITIVE_INTEGER_PATTERN.test(subject)) {
    return null;
  }
  if (role !== 'admin' && role !== 'agent') {
    return null;
  }
  return { id: Number(subject), role };
}
