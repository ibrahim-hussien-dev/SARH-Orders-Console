import type { Database } from 'better-sqlite3';
import type {
  IdempotencyKeyInsert,
  NewOrderItem,
  OrderInsert,
  OrderItemRecord,
  OrderRecord,
  StoredIdempotencyKey,
} from './create.types';

type OrderRow = Omit<OrderRecord, 'items'>;

export interface CreateOrderRepository {
  findKey(userId: number, key: string): StoredIdempotencyKey | undefined;
  insertOrder(order: OrderInsert): number;
  insertItems(orderId: number, items: NewOrderItem[]): void;
  insertKey(record: IdempotencyKeyInsert): void;
  loadOrder(orderId: number): OrderRecord;
}

export function createOrderRepository(db: Database): CreateOrderRepository {
  const findKeyStatement = db.prepare(
    'SELECT request_hash AS requestHash, order_id AS orderId FROM idempotency_keys WHERE user_id = ? AND "key" = ?',
  );
  const insertOrderStatement = db.prepare(
    `INSERT INTO orders (customer_name, customer_name_lc, customer_email, customer_email_lc, status, total_cents, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  );
  const insertItemStatement = db.prepare(
    'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
  );
  const insertKeyStatement = db.prepare(
    'INSERT INTO idempotency_keys (user_id, "key", request_hash, order_id, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const findOrderStatement = db.prepare(
    `SELECT id, customer_name AS customerName, customer_email AS customerEmail, status,
            total_cents AS totalCents, created_at AS createdAt
     FROM orders WHERE id = ?`,
  );
  const findItemsStatement = db.prepare(
    `SELECT id, order_id AS orderId, product_name AS productName, quantity, unit_price_cents AS unitPriceCents
     FROM order_items WHERE order_id = ? ORDER BY id`,
  );

  return {
    findKey(userId, key) {
      return findKeyStatement.get(userId, key) as StoredIdempotencyKey | undefined;
    },

    insertOrder(order) {
      const result = insertOrderStatement.run(
        order.customerName,
        order.customerNameLc,
        order.customerEmail,
        order.customerEmailLc,
        order.totalCents,
        order.createdAt,
      );
      return Number(result.lastInsertRowid);
    },

    insertItems(orderId, items) {
      for (const item of items) {
        insertItemStatement.run(orderId, item.productName, item.quantity, item.unitPriceCents);
      }
    },

    insertKey(record) {
      insertKeyStatement.run(
        record.userId,
        record.key,
        record.requestHash,
        record.orderId,
        record.createdAt,
      );
    },

    loadOrder(orderId) {
      const row = findOrderStatement.get(orderId) as OrderRow | undefined;
      if (row === undefined) {
        throw new Error(`Order ${orderId} does not exist`);
      }
      const items = findItemsStatement.all(orderId) as OrderItemRecord[];
      return { ...row, items };
    },
  };
}
