export type Role = 'admin' | 'agent';

export interface User {
  id: number;
  email: string;
  role: Role;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
];

export type SortField = 'created_at' | 'total_cents';
export type SortDirection = 'asc' | 'desc';

export interface ListFilters {
  q: string;
  status: OrderStatus | '';
  sort: SortField;
  dir: SortDirection;
}

export interface OrderSummary {
  id: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  itemCount: number;
}

export interface OrdersPage {
  items: OrderSummary[];
  nextCursor: string | null;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
}

export interface CreateOrderItemBody {
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderBody {
  customerName: string;
  customerEmail: string;
  items: CreateOrderItemBody[];
}
