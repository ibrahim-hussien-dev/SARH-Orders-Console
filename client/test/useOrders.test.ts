import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrders, type UseOrdersParams } from '../src/orders/useOrders';
import { fetchOrdersPage } from '../src/api/orders';
import type { OrdersPage as OrderPage } from '../src/types';

vi.mock('../src/api/orders', () => ({ fetchOrdersPage: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const base: UseOrdersParams = {
  q: '', status: '', sort: 'created_at', dir: 'desc', simulateSlow: false,
};
function page(id: number, nextCursor: string | null = null): OrderPage {
  return { items: [{
    id, customerName: `Customer ${id}`, customerEmail: 'test@example.com',
    status: 'paid', totalCents: 1999, createdAt: '2026-01-01T00:00:00.000Z', itemCount: 1,
  }], nextCursor };
}
async function tick(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
beforeEach(() => { vi.useFakeTimers(); vi.mocked(fetchOrdersPage).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('latest list request wins even when the transport ignores abort', () => {
  it('drops reordered first-page success and errors, including loading state', async () => {
    const old = deferred<OrderPage>();
    const middle = deferred<OrderPage>();
    const latest = deferred<OrderPage>();
    vi.mocked(fetchOrdersPage).mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(middle.promise).mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(useOrders, { initialProps: base });
    await tick();
    rerender({ ...base, status: 'pending' });
    await tick();
    rerender({ ...base, status: 'paid', sort: 'total_cents', dir: 'asc' });
    await tick();
    await act(async () => { middle.reject(new Error('stale error')); });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => { latest.resolve(page(3)); });
    await act(async () => { old.resolve(page(1)); });
    expect(result.current.items.map((row) => row.id)).toEqual([3]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('invalidates immediately while search waits 300ms, including status changes', async () => {
    const old = deferred<OrderPage>();
    vi.mocked(fetchOrdersPage).mockReturnValueOnce(old.promise).mockResolvedValue(page(2));
    const { result, rerender } = renderHook(useOrders, { initialProps: base });
    await tick();
    rerender({ ...base, q: 'Al' });
    await tick(200);
    await act(async () => { old.resolve(page(1)); });
    expect(result.current.items).toEqual([]);
    rerender({ ...base, q: 'Alice', status: 'paid' });
    await tick(100);
    rerender({ ...base, q: 'Alice', status: 'shipped' });
    await tick(199);
    expect(fetchOrdersPage).toHaveBeenCalledTimes(1);
    expect(result.current.items).toEqual([]);
    await tick(1);
    expect(fetchOrdersPage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchOrdersPage).mock.calls[1]?.[0]).toMatchObject({ q: 'Alice', status: 'shipped' });
    expect(result.current.items[0]?.id).toBe(2);
  });

  it.each(['resolve', 'reject'] as const)('drops a stale load-more %s after filters change', async (outcome) => {
    const more = deferred<OrderPage>();
    vi.mocked(fetchOrdersPage).mockResolvedValueOnce(page(1, 'cursor'))
      .mockReturnValueOnce(more.promise).mockResolvedValueOnce(page(3));
    const { result, rerender } = renderHook(useOrders, { initialProps: base });
    await tick();
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    expect(fetchOrdersPage).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMore).toBe(true);
    rerender({ ...base, status: 'paid' });
    expect(result.current.items).toEqual([]);
    await tick();
    await act(async () => {
      if (outcome === 'resolve') more.resolve(page(2, 'old-cursor'));
      else more.reject(new Error('stale load-more error'));
    });
    expect(result.current.items.map((row) => row.id)).toEqual([3]);
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not resurrect rows on A → B → A or reload while a request is pending', async () => {
    const old = deferred<OrderPage>();
    const latest = deferred<OrderPage>();
    vi.mocked(fetchOrdersPage).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(useOrders, { initialProps: base });
    await tick();
    rerender({ ...base, status: 'paid' });
    rerender(base);
    act(() => result.current.reload());
    await act(async () => { old.resolve(page(1)); });
    expect(result.current.items).toEqual([]);
    await tick();
    await act(async () => { latest.resolve(page(4)); });
    expect(result.current.items[0]?.id).toBe(4);
  });
});
