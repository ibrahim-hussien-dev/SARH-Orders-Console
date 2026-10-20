import { afterEach, expect, it, vi } from 'vitest';
import { onUnauthorized, request } from '../src/api/http';

afterEach(() => vi.unstubAllGlobals());

it('does not broadcast an aborted stale 401 after the transport finishes anyway', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const unauthorized = vi.fn();
  const unsubscribe = onUnauthorized(unauthorized);
  const controller = new AbortController();
  const result = request('/orders', { signal: controller.signal });
  controller.abort();
  finish(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }));
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(unauthorized).not.toHaveBeenCalled();
  unsubscribe();
});
