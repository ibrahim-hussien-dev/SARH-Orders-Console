import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? <>{children}</> : null;
}
