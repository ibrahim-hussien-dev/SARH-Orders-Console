import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NetworkError } from '../api/http';
import { createOrder } from '../api/orders';
import type { CreateOrderBody } from '../types';
import { bodySignature } from '../validation';
import { generateIdempotencyKey } from './idempotency';
import { clearPendingAttempt, isPersistenceAvailable, loadPendingAttempt, savePendingAttempt } from './pendingAttempt';

const CREATE_TIMEOUT_MS = 10000;

export type CreatePhase = 'idle' | 'submitting' | 'retryable' | 'conflict' | 'rejected' | 'success';

interface CreateState {
  phase: CreatePhase;
  message: string | null;
}

interface Attempt {
  key: string;
  body: CreateOrderBody;
  signature: string;
}

type FailureKind = 'unauthorized' | 'conflict' | 'rejected' | 'ambiguous';

export interface UseCreateOrderResult {
  phase: CreatePhase;
  message: string | null;
  storageWarning: boolean;
  pendingSignature: string | null;
  initialBody: CreateOrderBody | null;
  submit: (body: CreateOrderBody) => Promise<void>;
  retry: () => Promise<void>;
  dismissNotice: () => void;
}

const IDLE_STATE: CreateState = { phase: 'idle', message: null };

const RESTORED_MESSAGE =
  'An earlier submission may not have finished before the page was reloaded or the session ended. Press Retry to resend it safely with the same key.';

const CONFLICT_MESSAGE =
  'The server says this key was already used for a different order. Nothing was created by this request. Review the order and submit it again yourself; a new key will be used.';

function classifyFailure(error: unknown): FailureKind {
  if (!(error instanceof ApiError) || error.status >= 500) {
    return 'ambiguous';
  }
  if (error.status === 401) {
    return 'unauthorized';
  }
  return error.status === 422 ? 'conflict' : 'rejected';
}

function describeCause(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.kind === 'timeout' ? 'The request timed out after 10 seconds.' : 'The network request failed.';
  }
  if (error instanceof ApiError) {
    return `The server reported an error (status ${error.status}).`;
  }
  return 'The request did not complete.';
}

export function useCreateOrder(userId: number, onCreated: () => void): UseCreateOrderResult {
  const [initialAttempt] = useState(() => loadPendingAttempt(userId));
  const attemptRef = useRef<Attempt | null>(
    initialAttempt === null
      ? null
      : { key: initialAttempt.key, body: initialAttempt.body, signature: bodySignature(initialAttempt.body) },
  );
  const submittingRef = useRef(false);
  const disposedRef = useRef(false);
  const onCreatedRef = useRef(onCreated);

  const [state, setState] = useState<CreateState>(
    initialAttempt === null ? IDLE_STATE : { phase: 'retryable', message: RESTORED_MESSAGE },
  );
  const [pendingSignature, setPendingSignature] = useState<string | null>(attemptRef.current?.signature ?? null);
  const [storageWarning, setStorageWarning] = useState(() => !isPersistenceAvailable());

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  const send = useCallback(
    async (attempt: Attempt): Promise<void> => {
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setState({ phase: 'submitting', message: null });
      if (!savePendingAttempt({ userId, key: attempt.key, body: attempt.body })) {
        setStorageWarning(true);
      }

      try {
        const result = await createOrder(attempt.body, attempt.key, AbortSignal.timeout(CREATE_TIMEOUT_MS));
        if (disposedRef.current) {
          return;
        }
        attemptRef.current = null;
        setPendingSignature(null);
        clearPendingAttempt();
        const orderId = result.order.id;
        setState({
          phase: 'success',
          message: result.replayed
            ? `Order #${orderId} was already created by an earlier attempt. No duplicate was made.`
            : `Order #${orderId} created.`,
        });
        onCreatedRef.current();
      } catch (error) {
        if (disposedRef.current) {
          return;
        }
        const kind = classifyFailure(error);
        if (kind === 'unauthorized') {
          setState({ phase: 'retryable', message: 'Your session ended. Sign in again to continue.' });
        } else if (kind === 'conflict') {
          attemptRef.current = null;
          setPendingSignature(null);
          clearPendingAttempt();
          setState({ phase: 'conflict', message: CONFLICT_MESSAGE });
        } else if (kind === 'rejected') {
          attemptRef.current = null;
          setPendingSignature(null);
          clearPendingAttempt();
          const reason = error instanceof ApiError ? error.message : 'The order was rejected.';
          setState({ phase: 'rejected', message: `The server rejected the order: ${reason}` });
        } else {
          setState({
            phase: 'retryable',
            message: `${describeCause(error)} We could not confirm whether the order was created. Press Retry: it resends the same request with the same key, so it cannot create a duplicate.`,
          });
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [userId],
  );

  const submit = useCallback(
    (body: CreateOrderBody): Promise<void> => {
      if (submittingRef.current) {
        return Promise.resolve();
      }
      const signature = bodySignature(body);
      const existing = attemptRef.current;
      const attempt: Attempt =
        existing !== null && existing.signature === signature
          ? existing
          : { key: generateIdempotencyKey(), body, signature };
      attemptRef.current = attempt;
      setPendingSignature(signature);
      return send(attempt);
    },
    [send],
  );

  const retry = useCallback((): Promise<void> => {
    const attempt = attemptRef.current;
    return attempt === null ? Promise.resolve() : send(attempt);
  }, [send]);

  const dismissNotice = useCallback(() => {
    setState((current) =>
      current.phase === 'success' || current.phase === 'conflict' || current.phase === 'rejected'
        ? IDLE_STATE
        : current,
    );
  }, []);

  return {
    phase: state.phase,
    message: state.message,
    storageWarning,
    pendingSignature,
    initialBody: initialAttempt === null ? null : initialAttempt.body,
    submit,
    retry,
    dismissNotice,
  };
}
