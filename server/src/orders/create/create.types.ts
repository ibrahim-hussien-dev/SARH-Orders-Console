export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface NewOrderItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface NewOrderInput {
  customerName: string;
  customerEmail: string;
  items: NewOrderItem[];
}

export interface OrderItemRecord {
  id: number;
  orderId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderRecord {
  id: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  items: OrderItemRecord[];
}

export interface CreateOrderResult {
  order: OrderRecord;
  replayed: boolean;
}

export interface OrderInsert {
  customerName: string;
  customerNameLc: string;
  customerEmail: string;
  customerEmailLc: string;
  totalCents: number;
  createdAt: string;
}

export interface IdempotencyKeyInsert {
  userId: number;
  key: string;
  requestHash: string;
  orderId: number;
  createdAt: string;
}

export interface StoredIdempotencyKey {
  requestHash: string;
  orderId: number;
}
