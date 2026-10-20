import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError } from '../http/errors';
import { unauthenticatedError } from './auth.errors';
import type { AuthRepository } from './auth.repository';
import { signToken } from './auth.tokens';
import type { PublicUser } from './auth.types';

const BCRYPT_COST = 10;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_COST);

export interface LoginResult {
  user: PublicUser;
  token: string;
}

export interface AuthService {
  signup(email: string, password: string): Promise<LoginResult>;
  login(email: string, password: string): Promise<LoginResult>;
  getCurrentUser(id: number): PublicUser;
}

export function createAuthService(repository: AuthRepository, jwtSecret: string): AuthService {
  return {
    async signup(email, password) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const user = repository.createAgent(email, passwordHash);
      if (!user) {
        throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists. Sign in instead.');
      }
      return { user, token: signToken(user, jwtSecret) };
    },
    async login(email, password) {
      const user = repository.findByEmail(email);
      const passwordMatches = await bcrypt.compare(
        password,
        user ? user.passwordHash : DUMMY_PASSWORD_HASH,
      );
      if (!user || !passwordMatches) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }
      return {
        user: { id: user.id, email: user.email, role: user.role },
        token: signToken({ id: user.id, role: user.role }, jwtSecret),
      };
    },
    getCurrentUser(id) {
      const user = repository.findPublicById(id);
      if (!user) {
        throw unauthenticatedError();
      }
      return user;
    },
  };
}
