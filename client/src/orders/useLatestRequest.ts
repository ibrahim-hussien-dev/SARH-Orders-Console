import { useMemo, useRef } from 'react';

export interface RequestTicket {
  id: number;
  signal: AbortSignal;
}

export interface LatestRequestGate {
  begin: () => RequestTicket;
  invalidate: () => void;
  isCurrent: (ticket: RequestTicket) => boolean;
}

export function useLatestRequest(): LatestRequestGate {
  const counter = useRef(0);
  const controller = useRef<AbortController | null>(null);

  return useMemo(() => {
    const invalidate = () => {
      counter.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
    const begin = (): RequestTicket => {
      invalidate();
      const next = new AbortController();
      controller.current = next;
      return { id: counter.current, signal: next.signal };
    };
    const isCurrent = (ticket: RequestTicket): boolean =>
      ticket.id === counter.current && !ticket.signal.aborted;
    return { begin, invalidate, isCurrent };
  }, []);
}
