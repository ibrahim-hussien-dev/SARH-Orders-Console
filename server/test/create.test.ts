import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/connection';
import { errorHandler, notFoundHandler } from '../src/http/errors';
import { createOrderRepository } from '../src/orders/create/create.repository';
import { createCreateRouter } from '../src/orders/create/create.routes';

interface Fixture {
  db: Database;
  app: Express;
  directory: string;
  databasePath: string;
  agentId: number;
  otherAgentId: number;
}

interface OrderItemResponse {
  id: number;
  orderId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

interface OrderResponse {
  id: number;
  customerName: string;
  customerEmail: string;
  status: string;
  totalCents: number;
  createdAt: string;
  items: OrderItemResponse[];
}

interface ErrorResponse {
  error: { code: string; message: string; details?: unknown };
}

type JsonBody = Record<string, unknown>;

const COUNT_SQL = {
  orders: 'SELECT COUNT(*) AS count FROM orders',
  order_items: 'SELECT COUNT(*) AS count FROM order_items',
  idempotency_keys: 'SELECT COUNT(*) AS count FROM idempotency_keys',
} as const;

const BASE_TOTAL_CENTS = 2 * 1999 + 1 * 500;

let fixture: Fixture;

function insertUser(db: Database, email: string): number {
  const result = db
    .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run(email, 'test-only-hash', 'agent');
  return Number(result.lastInsertRowid);
}

function attachTestUser(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('x-test-user-id');
  if (header !== undefined) {
    req.user = { id: Number(header), role: 'agent' };
  }
  next();
}

function buildApp(db: Database): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(attachTestUser);
  app.use('/api/orders', createCreateRouter(db));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function buildItem(overrides: JsonBody = {}): JsonBody {
  return { productName: 'Widget', quantity: 2, unitPriceCents: 1999, ...overrides };
}

function buildGadget(): JsonBody {
  return buildItem({ productName: 'Gadget', quantity: 1, unitPriceCents: 500 });
}

function buildBody(overrides: JsonBody = {}): JsonBody {
  return {
    customerName: 'Alice Example',
    customerEmail: 'alice@example.com',
    items: [buildItem(), buildGadget()],
    ...overrides,
  };
}

function postOrder(userId: number, key: string | undefined, body: JsonBody): request.Test {
  const pending = request(fixture.app).post('/api/orders').set('x-test-user-id', String(userId));
  if (key !== undefined) {
    pending.set('Idempotency-Key', key);
  }
  return pending.send(body);
}

function orderOf(response: request.Response): OrderResponse {
  return (response.body as { order: OrderResponse }).order;
}

function errorOf(response: request.Response): ErrorResponse['error'] {
  return (response.body as ErrorResponse).error;
}

function responseWithStatus(responses: request.Response[], status: number): request.Response {
  const match = responses.find((response) => response.status === status);
  if (match === undefined) {
    throw new Error(`No response with status ${status}`);
  }
  return match;
}

function countRows(table: keyof typeof COUNT_SQL): number {
  const row = fixture.db.prepare(COUNT_SQL[table]).get() as { count: number };
  return row.count;
}

async function postWhileAnotherWriterHoldsTheLock(
  userId: number,
  key: string,
  body: JsonBody,
): Promise<request.Response> {
  const blocker = openDatabase(fixture.databasePath);
  try {
    blocker.exec('BEGIN IMMEDIATE');
    return await postOrder(userId, key, body);
  } finally {
    blocker.exec('ROLLBACK');
    blocker.close();
  }
}

const changedBodies: Array<[string, JsonBody]> = [
  ['customer name', buildBody({ customerName: 'Bob Example' })],
  ['customer email', buildBody({ customerEmail: 'bob@example.com' })],
  ['quantity', buildBody({ items: [buildItem({ quantity: 3 }), buildGadget()] })],
  ['item order', buildBody({ items: [buildGadget(), buildItem()] })],
  ['number of items', buildBody({ items: [buildItem(), buildGadget(), buildItem({ productName: 'Gizmo' })] })],
];

const badKeys: Array<[string, string | undefined]> = [
  ['missing', undefined],
  ['empty', ''],
  ['not a uuid', 'not-a-uuid'],
  ['a version 1 uuid', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
  ['a uuid with the wrong variant', '123e4567-e89b-42d3-c456-426614174000'],
  ['a uuid with trailing characters', `${randomUUID()}x`],
];

const invalidBodies: Array<[string, JsonBody]> = [
  ['no items', buildBody({ items: [] })],
  ['six items', buildBody({ items: Array.from({ length: 6 }, () => buildItem()) })],
  ['zero quantity', buildBody({ items: [buildItem({ quantity: 0 })] })],
  ['quantity above 1000', buildBody({ items: [buildItem({ quantity: 1001 })] })],
  ['fractional quantity', buildBody({ items: [buildItem({ quantity: 1.5 })] })],
  ['quantity sent as a string', buildBody({ items: [buildItem({ quantity: '2' })] })],
  ['negative price', buildBody({ items: [buildItem({ unitPriceCents: -1 })] })],
  ['price above 10000000 cents', buildBody({ items: [buildItem({ unitPriceCents: 10000001 })] })],
  ['fractional price', buildBody({ items: [buildItem({ unitPriceCents: 10.5 })] })],
  ['price sent as a string', buildBody({ items: [buildItem({ unitPriceCents: '19.99' })] })],
  ['blank product name', buildBody({ items: [buildItem({ productName: '   ' })] })],
  ['product name longer than 120 characters', buildBody({ items: [buildItem({ productName: 'x'.repeat(121) })] })],
  ['blank customer name', buildBody({ customerName: '  ' })],
  ['customer name longer than 120 characters', buildBody({ customerName: 'n'.repeat(121) })],
  ['malformed email', buildBody({ customerEmail: 'not-an-email' })],
  ['email longer than 254 characters', buildBody({ customerEmail: `${'a'.repeat(250)}@x.io` })],
  ['missing email', { customerName: 'Alice Example', items: [buildItem()] }],
  ['items that are not an array', buildBody({ items: 'nope' })],
];

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), 'sarh-create-'));
  const databasePath = join(directory, 'orders.db');
  const db = openDatabase(databasePath);
  fixture = {
    db,
    app: buildApp(db),
    directory,
    databasePath,
    agentId: insertUser(db, 'agent-one@sarh.test'),
    otherAgentId: insertUser(db, 'agent-two@sarh.test'),
  };
});

afterEach(() => {
  fixture.db.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

describe('POST /api/orders', () => {
  it('creates a pending order with a server-computed total and a UTC timestamp', async () => {
    const response = await postOrder(fixture.agentId, randomUUID(), buildBody());

    expect(response.status).toBe(201);
    expect(response.headers['idempotent-replayed']).toBeUndefined();
    const order = orderOf(response);
    expect(order.status).toBe('pending');
    expect(order.totalCents).toBe(BASE_TOTAL_CENTS);
    expect(new Date(order.createdAt).toISOString()).toBe(order.createdAt);
    expect(order.items).toEqual([
      { id: expect.any(Number), orderId: order.id, productName: 'Widget', quantity: 2, unitPriceCents: 1999 },
      { id: expect.any(Number), orderId: order.id, productName: 'Gadget', quantity: 1, unitPriceCents: 500 },
    ]);
  });

  it('answers two parallel requests with one key as one 201 and one 200 for the same order', async () => {
    const key = randomUUID();
    const body = buildBody();

    const responses = await Promise.all([
      postOrder(fixture.agentId, key, body),
      postOrder(fixture.agentId, key, body),
    ]);

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 201]);
    const created = responseWithStatus(responses, 201);
    const replayed = responseWithStatus(responses, 200);
    expect(created.headers['idempotent-replayed']).toBeUndefined();
    expect(replayed.headers['idempotent-replayed']).toBe('true');
    expect(orderOf(replayed)).toEqual(orderOf(created));
    expect(countRows('orders')).toBe(1);
    expect(countRows('order_items')).toBe(2);
    expect(countRows('idempotency_keys')).toBe(1);
  });

  it('replays a sequential repeat with the same order and the same item ids', async () => {
    const key = randomUUID();
    const body = buildBody();

    const first = await postOrder(fixture.agentId, key, body);
    const second = await postOrder(fixture.agentId, key, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(orderOf(second)).toEqual(orderOf(first));
    expect(countRows('orders')).toBe(1);
  });

  it('stores exactly one order for 20 parallel attempts with the same key', async () => {
    const key = randomUUID();
    const body = buildBody();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => postOrder(fixture.agentId, key, body)),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(19);
    expect(new Set(responses.map((response) => orderOf(response).id)).size).toBe(1);
    expect(countRows('orders')).toBe(1);
    expect(countRows('order_items')).toBe(2);
    expect(countRows('idempotency_keys')).toBe(1);
  });

  it('treats a body that differs only by whitespace and e-mail case as the same request', async () => {
    const key = randomUUID();

    const first = await postOrder(fixture.agentId, key, buildBody());
    const second = await postOrder(
      fixture.agentId,
      key,
      buildBody({
        customerName: '  Alice Example  ',
        customerEmail: ' ALICE@Example.COM ',
        items: [buildItem({ productName: ' Widget ' }), buildGadget()],
      }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(orderOf(second)).toEqual(orderOf(first));
    expect(countRows('orders')).toBe(1);
  });

  it('stores trimmed names, a lower-cased e-mail and the lower-cased search columns', async () => {
    const response = await postOrder(
      fixture.agentId,
      randomUUID(),
      buildBody({ customerName: '  Alice Example  ', customerEmail: '  Alice@Example.COM  ' }),
    );

    const order = orderOf(response);
    expect(order.customerName).toBe('Alice Example');
    expect(order.customerEmail).toBe('alice@example.com');
    const row = fixture.db
      .prepare(
        'SELECT customer_name, customer_name_lc, customer_email, customer_email_lc FROM orders WHERE id = ?',
      )
      .get(order.id);
    expect(row).toEqual({
      customer_name: 'Alice Example',
      customer_name_lc: 'alice example',
      customer_email: 'alice@example.com',
      customer_email_lc: 'alice@example.com',
    });
  });

  it.each(changedBodies)('rejects the same key when the %s changes', async (_label, changedBody) => {
    const key = randomUUID();

    const first = await postOrder(fixture.agentId, key, buildBody());
    const second = await postOrder(fixture.agentId, key, changedBody);

    expect(first.status).toBe(201);
    expect(second.status).toBe(422);
    expect(errorOf(second).code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(countRows('orders')).toBe(1);
    expect(countRows('order_items')).toBe(2);
  });

  it('treats upper-case and lower-case spellings of one key as the same key', async () => {
    const key = randomUUID();
    const body = buildBody();

    const first = await postOrder(fixture.agentId, key, body);
    const second = await postOrder(fixture.agentId, key.toUpperCase(), body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(orderOf(second).id).toBe(orderOf(first).id);
    expect(countRows('orders')).toBe(1);
  });

  it.each(badKeys)('rejects a request whose Idempotency-Key is %s', async (_label, badKey) => {
    const response = await postOrder(fixture.agentId, badKey, buildBody());

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(errorOf(response).details)).toContain('Idempotency-Key');
    expect(countRows('orders')).toBe(0);
  });

  it.each(invalidBodies)('rejects a body with %s', async (_label, body) => {
    const response = await postOrder(fixture.agentId, randomUUID(), body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).details).toBeDefined();
    expect(countRows('orders')).toBe(0);
    expect(countRows('idempotency_keys')).toBe(0);
  });

  it('ignores client-supplied id, status, total and timestamps', async () => {
    const key = randomUUID();
    const body = buildBody({
      id: 999,
      status: 'paid',
      totalCents: 1,
      createdAt: '2000-01-01T00:00:00.000Z',
      items: [buildItem({ id: 77, orderId: 5, totalCents: 1 }), buildGadget()],
    });

    const response = await postOrder(fixture.agentId, key, body);
    const replay = await postOrder(fixture.agentId, key, buildBody());

    const order = orderOf(response);
    expect(response.status).toBe(201);
    expect(order.id).not.toBe(999);
    expect(order.status).toBe('pending');
    expect(order.totalCents).toBe(BASE_TOTAL_CENTS);
    expect(order.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(order.items.map((item) => item.id)).not.toContain(77);
    expect(replay.status).toBe(200);
    expect(countRows('orders')).toBe(1);
    expect(countRows('order_items')).toBe(2);
  });

  it('accepts the boundary values of every limit', async () => {
    const customerName = 'n'.repeat(120);
    const maxItem = buildItem({ productName: 'x'.repeat(120), quantity: 1000, unitPriceCents: 10000000 });
    const freeItem = buildItem({ productName: 'Free sample', quantity: 1, unitPriceCents: 0 });

    const response = await postOrder(
      fixture.agentId,
      randomUUID(),
      buildBody({ customerName, items: [maxItem, maxItem, maxItem, maxItem, freeItem] }),
    );

    expect(response.status).toBe(201);
    const order = orderOf(response);
    expect(order.customerName).toBe(customerName);
    expect(order.items).toHaveLength(5);
    expect(order.totalCents).toBe(4 * 1000 * 10000000);
  });

  it('keeps the same key from two users apart', async () => {
    const key = randomUUID();
    const body = buildBody();

    const responses = await Promise.all([
      postOrder(fixture.agentId, key, body),
      postOrder(fixture.otherAgentId, key, body),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(new Set(responses.map((response) => orderOf(response).id)).size).toBe(2);
    expect(countRows('orders')).toBe(2);
    expect(countRows('idempotency_keys')).toBe(2);
  });

  it('removes items and the idempotency key when the order is deleted and frees the key', async () => {
    const key = randomUUID();
    const body = buildBody();
    const created = orderOf(await postOrder(fixture.agentId, key, body));
    expect(countRows('order_items')).toBe(2);
    expect(countRows('idempotency_keys')).toBe(1);

    const deleted = fixture.db.prepare('DELETE FROM orders WHERE id = ?').run(created.id);

    expect(deleted.changes).toBe(1);
    expect(countRows('order_items')).toBe(0);
    expect(countRows('idempotency_keys')).toBe(0);
    const again = await postOrder(fixture.agentId, key, body);
    expect(again.status).toBe(201);
    expect(orderOf(again).id).not.toBe(created.id);
  });

  it('leaves no partial records when the transaction fails after the order is inserted', async () => {
    const key = randomUUID();
    const body = buildBody();
    fixture.db.exec(
      "CREATE TRIGGER force_key_failure BEFORE INSERT ON idempotency_keys BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
    );

    const failed = await postOrder(fixture.agentId, key, body);

    expect(failed.status).toBe(500);
    expect(errorOf(failed).code).toBe('INTERNAL');
    expect(JSON.stringify(failed.body)).not.toContain('forced failure');
    expect(countRows('orders')).toBe(0);
    expect(countRows('order_items')).toBe(0);
    expect(countRows('idempotency_keys')).toBe(0);

    fixture.db.exec('DROP TRIGGER force_key_failure');
    const retry = await postOrder(fixture.agentId, key, body);
    expect(retry.status).toBe(201);
    expect(countRows('orders')).toBe(1);
  });

  it('answers 503 while another writer holds the lock and succeeds on a retry with the same key', async () => {
    const key = randomUUID();
    const body = buildBody();
    fixture.db.pragma('busy_timeout = 50');

    const busy = await postWhileAnotherWriterHoldsTheLock(fixture.agentId, key, body);

    expect(busy.status).toBe(503);
    expect(errorOf(busy).code).toBe('SERVICE_UNAVAILABLE');
    expect(countRows('orders')).toBe(0);
    const retry = await postOrder(fixture.agentId, key, body);
    expect(retry.status).toBe(201);
    expect(countRows('orders')).toBe(1);
  });

  it('answers 401 when the router is reached without an authenticated user', async () => {
    const response = await request(fixture.app)
      .post('/api/orders')
      .set('Idempotency-Key', randomUUID())
      .send(buildBody());

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('UNAUTHENTICATED');
    expect(countRows('orders')).toBe(0);
  });

  it('refuses to load an order that does not exist', () => {
    expect(() => createOrderRepository(fixture.db).loadOrder(12345)).toThrow('Order 12345 does not exist');
  });
});
