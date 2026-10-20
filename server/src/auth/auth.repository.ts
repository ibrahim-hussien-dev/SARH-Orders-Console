import type { Database } from 'better-sqlite3';
import type { PublicUser, UserRole } from './auth.types';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface AuthRepository {
  findByEmail(email: string): UserRecord | undefined;
  findPublicById(id: number): PublicUser | undefined;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
}

export function createAuthRepository(db: Database): AuthRepository {
  const selectByEmail = db.prepare(
    'SELECT id, email, password_hash, role FROM users WHERE email = ?',
  );
  const selectPublicById = db.prepare('SELECT id, email, role FROM users WHERE id = ?');

  return {
    findByEmail(email) {
      const row = selectByEmail.get(email) as UserRow | undefined;
      if (!row) {
        return undefined;
      }
      return { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role };
    },
    findPublicById(id) {
      return selectPublicById.get(id) as PublicUser | undefined;
    },
  };
}
