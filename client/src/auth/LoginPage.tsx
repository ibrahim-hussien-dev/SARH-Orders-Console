import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, NetworkError } from '../api/http';
import { LIMITS } from '../validation';
import { useAuth } from './AuthContext';

function describeLoginFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Invalid email or password.';
    }
    if (error.status === 429) {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }
    if (error.status === 400) {
      return 'Enter a valid email and password.';
    }
  }
  if (error instanceof NetworkError) {
    return 'Could not reach the server. Check your connection.';
  }
  return 'Sign-in failed. Please try again.';
}

export function LoginPage() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const emailId = useId();
  const passwordId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (failure) {
      setError(describeLoginFailure(failure));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <h1>SARH Orders Console</h1>
      <form className="card" onSubmit={handleSubmit} aria-busy={submitting}>
        <h2>Sign in</h2>
        {notice !== null && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor={emailId}>Email</label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            required
            maxLength={LIMITS.emailMax}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={passwordId}>Password</label>
          <input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            required
            maxLength={LIMITS.passwordMax}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
