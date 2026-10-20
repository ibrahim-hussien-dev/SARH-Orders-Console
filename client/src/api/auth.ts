import type { User } from '../types';
import { request } from './http';

interface UserResponse {
  user: User;
}

export async function login(email: string, password: string): Promise<User> {
  const response = await request<UserResponse>('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
    reportUnauthorized: false,
  });
  return response.data.user;
}

export async function fetchCurrentUser(signal: AbortSignal): Promise<User> {
  const response = await request<UserResponse>('/auth/me', { signal, reportUnauthorized: false });
  return response.data.user;
}

export async function logout(): Promise<void> {
  await request<null>('/auth/logout', { method: 'POST', reportUnauthorized: false });
}
