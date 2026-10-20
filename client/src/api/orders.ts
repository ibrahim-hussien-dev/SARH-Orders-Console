import type { CreateOrderBody, Order, OrdersPage, OrderStatus, SortDirection, SortField } from '../types';
import { request } from './http';

export const PAGE_SIZE = 50;

export interface ListRequest {
  q: string;
  status: OrderStatus | '';
  sort: SortField;
  dir: SortDirection;
  cursor: string | null;
  delayMs: number | null;
}

export interface CreateOrderResult {
  order: Order;
  replayed: boolean;
}

export async function fetchOrdersPage(listRequest: ListRequest, signal: AbortSignal): Promise<OrdersPage> {
  const query = new URLSearchParams({
    sort: listRequest.sort,
    dir: listRequest.dir,
    limit: String(PAGE_SIZE),
  });
  if (listRequest.q !== '') {
    query.set('q', listRequest.q);
  }
  if (listRequest.status !== '') {
    query.set('status', listRequest.status);
  }
  if (listRequest.cursor !== null) {
    query.set('cursor', listRequest.cursor);
  }
  if (listRequest.delayMs !== null) {
    query.set('_delayMs', String(listRequest.delayMs));
  }
  const response = await request<OrdersPage>('/orders', { query, signal });
  return response.data;
}

export async function createOrder(
  body: CreateOrderBody,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<CreateOrderResult> {
  const response = await request<{ order: Order }>('/orders', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  });
  return {
    order: response.data.order,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
  };
}

export async function deleteOrder(id: number): Promise<void> {
  await request<null>(`/orders/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}
