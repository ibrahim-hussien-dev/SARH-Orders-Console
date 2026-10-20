import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, describeFailure } from '../api/http';
import { deleteOrder } from '../api/orders';

export interface UseDeleteOrderResult {
  deletingId: number | null;
  error: string | null;
  remove: (id: number) => Promise<void>;
}

export function useDeleteOrder(onDeleted: () => void): UseDeleteOrderResult {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const onDeletedRef = useRef(onDeleted);

  useEffect(() => {
    onDeletedRef.current = onDeleted;
  }, [onDeleted]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const remove = useCallback(async (id: number) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setDeletingId(id);
    setError(null);
    try {
      await deleteOrder(id);
      if (mountedRef.current) {
        onDeletedRef.current();
      }
    } catch (failure) {
      if (!mountedRef.current) {
        return;
      }
      setError(describeFailure(failure));
      if (failure instanceof ApiError && failure.status === 404) {
        onDeletedRef.current();
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setDeletingId(null);
      }
    }
  }, []);

  return { deletingId, error, remove };
}
