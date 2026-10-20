import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import type { AppConfig } from '../src/config';
import { openDatabase } from '../src/db/connection';
import { errorHandler, notFoundHandler } from '../src/http/errors';
import { buildPageQuery } from '../src/orders/list/list.repository';
import type { PageFilters } from '../src/orders/list/list.repository';
import { createListRouter } from '../src/orders/list/list.routes';
import type { OrderListItem, OrderPage, SortColumn, SortDirection } from '../src/orders/list/list.types';
import { encodeCursor } from '../src/orders/list/list.cursor';

interface ErrorBody {
  error: { code: string; message: string };
}

interface Fixture {
  name: string;
  email: string;
  status: string;
  totalCents: number;
  createdAt: string;
  itemCount: number;
}

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const TIMESTAMPS = Array.from({ length: 8 }, (_, day) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString());
const COMBINATIONS: Array<[SortColumn, SortDirection]> = [
  ['created_at', 'desc'],
  ['created_at', 'asc'],
  ['total_cents', 'desc'],
  ['total_cents', 'asc'],
];

let tempDir: string;
let db: Database;
let app: Express;
let testConfig: AppConfig;
let totalOrders: number;

function buildFixtures(): Fixture[] {
  const regular: Fixture[] = Array.from({ length: 120 }, (_, index) => ({
    name: `Customer ${index + 1}`,
    email: `customer${index + 1}@example.com`,
    status: STATUSES[index % STATUSES.length] as string,
    totalCents: (index % 9) * 250 + 100,
    createdAt: TIMESTAMPS[index % TIMESTAMPS.length] as string,
    itemCount: (index % 3) + 1,
  }));
  const special = [
    ['Discount 50% Club', 'club@example.com'],
    ['Under_Score Co', 'us@example.com'],
    ['UnderXScore Co', 'ux@example.com'],
    ['Mixed Case', 'MiXed.Case@Example.COM'],
    ['Back\\Slash Ltd', 'slash@example.com'],
  ].map(([name, email], index) => ({
    name: name as string,
    email: email as string,
    status: 'paid',
    totalCents: 500 + index,
    createdAt: TIMESTAMPS[index] as string,
    itemCount: 1,
  }));
  return [...regular, ...special];
}

function insertFixtures(database: Database, fixtures: Fixture[]): void {
  const insertOrder = database.prepare(
    `INSERT INTO orders
      (customer_name, customer_name_lc, customer_email, customer_email_lc, status, total_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = database.prepare(
    'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, 1, 100)',
  );
  database.transaction(() => {
    for (const fixture of fixtures) {
      const result = insertOrder.run(
        fixture.name,
        fixture.name.trim().toLowerCase(),
        fixture.email,
        fixture.email.trim().toLowerCase(),
        fixture.status,
        fixture.totalCents,
        fixture.createdAt,
      );
      for (let item = 0; item < fixture.itemCount; item += 1) {
        insertItem.run(Number(result.lastInsertRowid), `Product ${item + 1}`);
      }
    }
  })();
}

function buildApp(database: Database, config: AppConfig): Express {
  const instance = express();
  instance.use('/api/orders', createListRouter(database, config));
  instance.use(notFoundHandler);
  instance.use(errorHandler);
  return instance;
}

function listUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query === '' ? '/api/orders' : `/api/orders?${query}`;
}

async function get(target: Express, url: string): Promise<{ status: number; body: unknown }> {
  const response = await request(target).get(url);
  return { status: response.status, body: response.body };
}

async function collectAll(
  params: Record<string, string>,
): Promise<{ items: OrderListItem[]; pages: number }> {
  const items: OrderListItem[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const response = await get(app, listUrl(cursor === null ? params : { ...params, cursor }));
    expect(response.status).toBe(200);
    const page = response.body as OrderPage;
    items.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
    expect(pages).toBeLessThan(200);
  } while (cursor !== null);
  return { items, pages };
}

function isCorrectlyOrdered(
  previous: OrderListItem,
  next: OrderListItem,
  sort: SortColumn,
  dir: SortDirection,
): boolean {
  const a = sort === 'created_at' ? previous.createdAt : previous.totalCents;
  const b = sort === 'created_at' ? next.createdAt : next.totalCents;
  let comparison: number;
  if (a < b) {
    comparison = -1;
  } else if (a > b) {
    comparison = 1;
  } else {
    comparison = previous.id < next.id ? -1 : 1;
  }
  return dir === 'asc' ? comparison < 0 : comparison > 0;
}

function largestTieGroup(items: OrderListItem[]): number {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.createdAt, (counts.get(item.createdAt) ?? 0) + 1);
  }
  return Math.max(...counts.values());
}

function planDetails(database: Database, filters: PageFilters): string {
  const { sql, args } = buildPageQuery(filters);
  const rows = database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as Array<{ detail: string }>;
  return rows.map((row) => row.detail).join('\n');
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarh-list-test-'));
  const dbPath = path.join(tempDir, 'orders.db');
  testConfig = loadConfig({ JWT_SECRET: SECRET, NODE_ENV: 'test', DB_PATH: dbPath });
  db = openDatabase(dbPath);
  insertFixtures(db, buildFixtures());
  totalOrders = (db.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count;
  app = buildApp(db, testConfig);
});

afterAll(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/orders pagination', () => {
  it.each(COMBINATIONS)(
    'returns every row exactly once, in order, for sort=%s dir=%s',
    async (sort, dir) => {
      const { items } = await collectAll({ sort, dir, limit: '7' });
      expect(items).toHaveLength(totalOrders);
      expect(new Set(items.map((item) => item.id)).size).toBe(totalOrders);
      expect(largestTieGroup(items)).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < items.length; index += 1) {
        const previous = items[index - 1] as OrderListItem;
        const next = items[index] as OrderListItem;
        expect(isCorrectlyOrdered(previous, next, sort, dir)).toBe(true);
      }
    },
  );

  it('uses defaults created_at desc, limit 50, and the documented item shape', async () => {
    const response = await get(app, '/api/orders');
    const page = response.body as OrderPage;
    expect(response.status).toBe(200);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).not.toBeNull();
    expect(Object.keys(page.items[0] as OrderListItem).sort()).toEqual(
      ['createdAt', 'customerEmail', 'customerName', 'id', 'itemCount', 'status', 'totalCents'].sort(),
    );
  });

  it('ends with a null cursor and no empty trailing page', async () => {
    const { pages, items } = await collectAll({ limit: '25' });
    expect(items).toHaveLength(totalOrders);
    expect(pages).toBe(Math.ceil(totalOrders / 25));
  });

  it('computes itemCount from order_items', async () => {
    const { items } = await collectAll({ limit: '100' });
    const countItems = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?');
    for (const item of items) {
      const row = countItems.get(item.id) as { count: number };
      expect(item.itemCount).toBe(row.count);
    }
  });
});

describe('GET /api/orders filters', () => {
  it('filters by status', async () => {
    const { items } = await collectAll({ status: 'paid', limit: '20' });
    const expected = (db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'").get() as {
      count: number;
    }).count;
    expect(items).toHaveLength(expected);
    expect(items.every((item) => item.status === 'paid')).toBe(true);
  });

  it('treats empty q, status and cursor as absent', async () => {
    const response = await get(app, '/api/orders?q=&status=&cursor=&limit=5');
    expect(response.status).toBe(200);
    expect((response.body as OrderPage).items).toHaveLength(5);
  });

  it('matches customer name case-insensitively', async () => {
    const { items } = await collectAll({ q: 'mIxEd CaSe' });
    expect(items.map((item) => item.customerName)).toEqual(['Mixed Case']);
  });

  it('matches customer email case-insensitively', async () => {
    const { items } = await collectAll({ q: 'MIXED.CASE@EXAMPLE' });
    expect(items.map((item) => item.customerEmail)).toEqual(['MiXed.Case@Example.COM']);
  });

  it('trims q before matching', async () => {
    const { items } = await collectAll({ q: '   mixed case   ' });
    expect(items).toHaveLength(1);
  });

  it('treats % as a literal character', async () => {
    const percent = await collectAll({ q: '50%' });
    expect(percent.items.map((item) => item.customerName)).toEqual(['Discount 50% Club']);
    const onlyPercent = await collectAll({ q: '%' });
    expect(onlyPercent.items.map((item) => item.customerName)).toEqual(['Discount 50% Club']);
  });

  it('treats _ as a literal character', async () => {
    const underscore = await collectAll({ q: 'under_score' });
    expect(underscore.items.map((item) => item.customerName)).toEqual(['Under_Score Co']);
  });

  it('treats a backslash as a literal character', async () => {
    const { items } = await collectAll({ q: '\\' });
    expect(items.map((item) => item.customerName)).toEqual(['Back\\Slash Ltd']);
  });

  it('keeps paging correctly when q and status are combined', async () => {
    const { items } = await collectAll({ q: 'customer 1', status: 'pending', limit: '3', sort: 'total_cents', dir: 'asc' });
    expect(items.length).toBeGreaterThan(3);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.status === 'pending')).toBe(true);
  });
});

describe('GET /api/orders validation', () => {
  const invalidCursors: Array<[string, string]> = [
    ['not base64url', '!!!'],
    ['not JSON', Buffer.from('nope').toString('base64url')],
    ['wrong v type for created_at', encodeCursor({ v: 5, id: 1 })],
    ['missing id', Buffer.from(JSON.stringify({ v: TIMESTAMPS[0] })).toString('base64url')],
    ['extra key', Buffer.from(JSON.stringify({ v: TIMESTAMPS[0], id: 1, x: 1 })).toString('base64url')],
    ['non-integer id', Buffer.from(JSON.stringify({ v: TIMESTAMPS[0], id: 1.5 })).toString('base64url')],
  ];

  it.each(invalidCursors)('rejects a malformed cursor (%s) with 400', async (_label, cursor) => {
    const response = await get(app, listUrl({ cursor }));
    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a string cursor value for sort=total_cents', async () => {
    const cursor = encodeCursor({ v: TIMESTAMPS[0] as string, id: 1 });
    const response = await get(app, listUrl({ sort: 'total_cents', cursor }));
    expect(response.status).toBe(400);
  });

  it('rejects limit 101 with 400 VALIDATION_ERROR', async () => {
    const response = await get(app, '/api/orders?limit=101');
    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  const invalidQueries = [
    '?limit=0',
    '?limit=abc',
    '?limit=',
    '?sort=customer_name',
    '?dir=sideways',
    '?status=unknown',
    '?q=a&q=b',
    '?q[x]=1',
    `?q=${'a'.repeat(101)}`,
    '?_delayMs=3001',
  ];

  it.each(invalidQueries)('rejects invalid query %s with 400', async (query) => {
    const response = await get(app, `/api/orders${query}`);
    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/orders _delayMs', () => {
  it('delays the response outside production', async () => {
    const startedAt = Date.now();
    const response = await get(app, '/api/orders?_delayMs=100&limit=1');
    expect(response.status).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
  });

  it('ignores _delayMs in production, even an invalid one', async () => {
    const productionConfig = loadConfig({
      JWT_SECRET: SECRET,
      NODE_ENV: 'production',
      DB_PATH: testConfig.dbPath,
    });
    const productionApp = buildApp(db, productionConfig);
    const startedAt = Date.now();
    const slow = await get(productionApp, '/api/orders?_delayMs=1500&limit=1');
    const invalid = await get(productionApp, '/api/orders?_delayMs=abc&limit=1');
    expect(slow.status).toBe(200);
    expect(invalid.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});

describe('query plans (asserted, verify by running the suite)', () => {
  const base: Omit<PageFilters, 'sort' | 'dir'> = {
    q: undefined,
    status: 'paid',
    cursor: undefined,
    fetchLimit: 51,
  };

  it.each<SortDirection>(['desc', 'asc'])('status + created_at (%s) names idx_orders_status_created', (dir) => {
    expect(planDetails(db, { ...base, sort: 'created_at', dir })).toContain('idx_orders_status_created');
  });

  it.each<SortDirection>(['desc', 'asc'])('status + total_cents (%s) names idx_orders_status_total', (dir) => {
    expect(planDetails(db, { ...base, sort: 'total_cents', dir })).toContain('idx_orders_status_total');
  });
});
