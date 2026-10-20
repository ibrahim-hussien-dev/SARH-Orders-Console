import type { Database } from 'better-sqlite3';
import { HttpError } from '../../http/errors';
import { hashRequest } from './create.hash';
import type { CreateOrderRepository } from './create.repository';
import type { CreateOrderResult, NewOrderInput, StoredIdempotencyKey } from './create.types';

export interface CreateOrderService {
  create(userId: number, key: string, input: NewOrderInput): CreateOrderResult;
}

function computeTotalCents(input: NewOrderInput): number {
  return input.items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

export function createOrderService(
  db: Database,
  repository: CreateOrderRepository,
): CreateOrderService {
  function replayStoredOrder(stored: StoredIdempotencyKey, requestHash: string): CreateOrderResult {
    if (stored.requestHash !== requestHash) {
      throw new HttpError(
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used with a different request body.',
      );
    }
    return { order: repository.loadOrder(stored.orderId), replayed: true };
  }

  function insertNewOrder(
    userId: number,
    key: string,
    input: NewOrderInput,
    requestHash: string,
  ): CreateOrderResult {
    const createdAt = new Date().toISOString();
    const orderId = repository.insertOrder({
      customerName: input.customerName,
      customerNameLc: input.customerName.toLowerCase(),
      customerEmail: input.customerEmail,
      customerEmailLc: input.customerEmail.toLowerCase(),
      totalCents: computeTotalCents(input),
      createdAt,
    });
    repository.insertItems(orderId, input.items);
    repository.insertKey({ userId, key, requestHash, orderId, createdAt });
    return { order: repository.loadOrder(orderId), replayed: false };
  }

  const createInTransaction = db.transaction(
    (userId: number, key: string, input: NewOrderInput, requestHash: string): CreateOrderResult => {
      const stored = repository.findKey(userId, key);
      if (stored === undefined) {
        return insertNewOrder(userId, key, input, requestHash);
      }
      return replayStoredOrder(stored, requestHash);
    },
  );

  return {
    create: (userId, key, input) =>
      createInTransaction.immediate(userId, key, input, hashRequest(input)),
  };
}
