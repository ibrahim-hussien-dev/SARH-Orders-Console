import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { describeFailure, isAbortError } from '../api/http';
import { fetchOrdersPage } from '../api/orders';
import type { ListFilters, OrderSummary } from '../types';
import { useLatestRequest } from './useLatestRequest';

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SLOW_DELAY_MS = 2500;

export interface UseOrdersParams extends ListFilters {
  simulateSlow: boolean;
}

export interface UseOrdersResult {
  items: OrderSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => void;
  reload: () => void;
}

interface ListState {
  key: string;
  items: OrderSummary[];
  nextCursor: string | null;
  phase: 'loading' | 'ready' | 'error';
  error: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
}

function loadingState(key: string): ListState {
  return { key, items: [], nextCursor: null, phase: 'loading', error: null, loadingMore: false, loadMoreError: null };
}

function failedState(key: string, message: string): ListState {
  return { ...loadingState(key), phase: 'error', error: message };
}

function pickDelay(simulateSlow: boolean): number | null {
  if (!simulateSlow || !import.meta.env.DEV) {
    return null;
  }
  return Math.floor(Math.random() * (MAX_SLOW_DELAY_MS + 1));
}

export function useOrders(params: UseOrdersParams): UseOrdersResult {
  const { status, sort, dir, simulateSlow } = params;
  const query = params.q.trim();
  const key = JSON.stringify([query, status, sort, dir]);

  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>(() => loadingState(key));
  const gate = useLatestRequest();
  const previousQueryRef = useRef(query);
  const searchReadyAtRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const simulateSlowRef = useRef(simulateSlow);
  simulateSlowRef.current = simulateSlow;

  useLayoutEffect(() => {
    // Invalidate before paint, including the entire search debounce interval.
    // A status/sort change must not bypass a still-pending search debounce.
    if (previousQueryRef.current !== query) {
      searchReadyAtRef.current = Date.now() + SEARCH_DEBOUNCE_MS;
    }
    const delay = Math.max(0, searchReadyAtRef.current - Date.now());
    previousQueryRef.current = query;
    loadingMoreRef.current = false;
    setState(loadingState(key));

    const timer = window.setTimeout(() => {
      const ticket = gate.begin();
      fetchOrdersPage(
        { q: query, status, sort, dir, cursor: null, delayMs: pickDelay(simulateSlowRef.current) },
        ticket.signal,
      ).then(
        (page) => {
          if (!gate.isCurrent(ticket)) {
            return;
          }
          setState({
            key,
            items: page.items,
            nextCursor: page.nextCursor,
            phase: 'ready',
            error: null,
            loadingMore: false,
            loadMoreError: null,
          });
        },
        (error: unknown) => {
          if (!gate.isCurrent(ticket) || isAbortError(error)) {
            return;
          }
          setState(failedState(key, describeFailure(error)));
        },
      );
    }, delay);

    return () => {
      window.clearTimeout(timer);
      gate.invalidate();
    };
  }, [key, query, status, sort, dir, reloadToken, gate]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || state.key !== key || state.phase !== 'ready' || state.nextCursor === null) {
      return;
    }
    const cursor = state.nextCursor;
    loadingMoreRef.current = true;
    setState((current) => (current.key === key ? { ...current, loadingMore: true, loadMoreError: null } : current));

    const ticket = gate.begin();
    fetchOrdersPage(
      { q: query, status, sort, dir, cursor, delayMs: pickDelay(simulateSlowRef.current) },
      ticket.signal,
    ).then(
      (page) => {
        if (!gate.isCurrent(ticket)) {
          return;
        }
        loadingMoreRef.current = false;
        setState((current) =>
          current.key === key
            ? { ...current, items: [...current.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false }
            : current,
        );
      },
      (error: unknown) => {
        if (!gate.isCurrent(ticket) || isAbortError(error)) {
          return;
        }
        loadingMoreRef.current = false;
        setState((current) =>
          current.key === key ? { ...current, loadingMore: false, loadMoreError: describeFailure(error) } : current,
        );
      },
    );
  }, [state, key, query, status, sort, dir, gate]);

  const reload = useCallback(() => {
    gate.invalidate();
    loadingMoreRef.current = false;
    setState(loadingState(key));
    setReloadToken((token) => token + 1);
  }, [gate, key]);

  const view = state.key === key ? state : loadingState(key);

  return {
    items: view.items,
    loading: view.phase === 'loading',
    error: view.phase === 'error' ? view.error : null,
    hasMore: view.phase === 'ready' && view.nextCursor !== null,
    loadingMore: view.loadingMore,
    loadMoreError: view.loadMoreError,
    loadMore,
    reload,
  };
}
