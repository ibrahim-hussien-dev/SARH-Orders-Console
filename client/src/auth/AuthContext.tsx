import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchCurrentUser, login as loginRequest, signup as signupRequest, logout as logoutRequest } from '../api/auth';
import { ApiError, isAbortError, onUnauthorized } from '../api/http';
import { clearPendingAttempt, discardAttemptsOfOtherUsers } from '../orders/pendingAttempt';
import type { User } from '../types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED_NOTICE = 'Your session expired. Please sign in again.';
const SERVER_UNREACHABLE_NOTICE = 'Could not reach the server. Check your connection and sign in again.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentUser(controller.signal).then(
      (currentUser) => {
        discardAttemptsOfOtherUsers(currentUser.id);
        setUser(currentUser);
        setStatus('authenticated');
      },
      (error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        setUser(null);
        setStatus('unauthenticated');
        if (!(error instanceof ApiError && error.status === 401)) {
          setNotice(SERVER_UNREACHABLE_NOTICE);
        }
      },
    );
    return () => controller.abort();
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setStatus('unauthenticated');
        setNotice(SESSION_EXPIRED_NOTICE);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await loginRequest(email, password);
    discardAttemptsOfOtherUsers(signedIn.id);
    setUser(signedIn);
    setStatus('authenticated');
    setNotice(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    }
    clearPendingAttempt();
    setUser(null);
    setStatus('unauthenticated');
    setNotice(null);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const registered = await signupRequest(email, password);
    discardAttemptsOfOtherUsers(registered.id);
    setUser(registered);
    setStatus('authenticated');
    setNotice(null);
  }, []);

  const value = useMemo(
    () => ({ status, user, notice, login, signup, logout }),
    [status, user, notice, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
