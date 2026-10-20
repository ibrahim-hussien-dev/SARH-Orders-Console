export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SORT_COLUMNS = ['created_at', 'total_cents'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface Cursor {
  v: string | number;
  id: number;
}

export interface ListQuery {
  q: string | undefined;
  status: OrderStatus | undefined;
  sort: SortColumn;
  dir: SortDirection;
  cursor: Cursor | undefined;
  limit: number;
  delayMs: number | undefined;
}

export interface OrderRow {
  id: number;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  item_count: number;
}

export interface OrderListItem {
  id: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  itemCount: number;
}

export interface OrderPage {
  items: OrderListItem[];
  nextCursor: string | null;
}
