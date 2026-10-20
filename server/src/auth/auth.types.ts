export type UserRole = 'admin' | 'agent';

export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  id: number;
  role: UserRole;
}
