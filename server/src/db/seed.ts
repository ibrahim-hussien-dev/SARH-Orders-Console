import bcrypt from 'bcryptjs';
import type { Database } from 'better-sqlite3';
import { loadConfig } from '../config';
import { openDatabase } from './connection';

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

interface GeneratedItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

interface GeneratedOrder {
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  items: GeneratedItem[];
}

const SEED_VALUE = 20261020;
const ORDER_COUNT = 50000;
const BATCH_SIZE = 1000;
const BCRYPT_COST = 10;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const SEED_USERS = [
  { email: 'admin@sarh.test', password: 'Admin#12345', role: 'admin' },
  { email: 'agent@sarh.test', password: 'Agent#12345', role: 'agent' },
] as const;

const STATUS_WEIGHTS: ReadonlyArray<readonly [OrderStatus, number]> = [
  ['pending', 15],
  ['paid', 25],
  ['shipped', 20],
  ['delivered', 30],
  ['cancelled', 10],
];

const FIRST_NAMES = [
  'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas',
  'Mia', 'Amir', 'Layla', 'Omar', 'Nour', 'Youssef', 'Hana', 'Karim', 'Salma', 'Tarek',
];

const LAST_NAMES = [
  'Johnson', 'Smith', 'Brown', 'Garcia', 'Miller', 'Davis', 'Hassan', 'Ibrahim', 'Mostafa', 'Nasser',
  'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Khalil', 'Saleh', 'Farouk', 'Adel', 'Mansour',
];

const EMAIL_DOMAINS = ['example.com', 'mail.test', 'shop.example.org', 'inbox.test'];

const PRODUCTS: ReadonlyArray<{ name: string; baseCents: number }> = [
  { name: 'Cotton T-Shirt', baseCents: 1800 },
  { name: 'Denim Jacket', baseCents: 8900 },
  { name: 'Leather Belt', baseCents: 2500 },
  { name: 'Running Shoes', baseCents: 11900 },
  { name: 'Wool Scarf', baseCents: 3200 },
  { name: 'Canvas Backpack', baseCents: 5400 },
  { name: 'Sunglasses', baseCents: 7600 },
  { name: 'Wrist Watch', baseCents: 24900 },
  { name: 'Phone Case', baseCents: 1200 },
  { name: 'Ceramic Mug', baseCents: 900 },
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pickFrom<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function pickStatus(random: () => number): OrderStatus {
  let roll = randomInt(random, 1, 100);
  for (const [status, weight] of STATUS_WEIGHTS) {
    if (roll <= weight) {
      return status;
    }
    roll -= weight;
  }
  return 'delivered';
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function generateItems(random: () => number): GeneratedItem[] {
  const itemCount = randomInt(random, 1, 5);
  const items: GeneratedItem[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const product = pickFrom(random, PRODUCTS);
    items.push({
      productName: product.name,
      quantity: randomInt(random, 1, 5),
      unitPriceCents: product.baseCents + randomInt(random, 0, 20) * 50,
    });
  }
  return items;
}

function generateOrder(random: () => number, nowMs: number): GeneratedOrder {
  const first = pickFrom(random, FIRST_NAMES);
  const last = pickFrom(random, LAST_NAMES);
  const localPart = `${first}.${last}${randomInt(random, 1, 9999)}`.toLowerCase();
  const email = `${localPart}@${pickFrom(random, EMAIL_DOMAINS)}`;
  const items = generateItems(random);
  const createdMs = nowMs - Math.floor(random() * TWO_YEARS_MS);
  return {
    customerName: `${first} ${last}`,
    customerEmail: random() < 0.1 ? capitalise(email) : email,
    status: pickStatus(random),
    totalCents: items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
    createdAt: new Date(Math.floor(createdMs / 1000) * 1000).toISOString(),
    items,
  };
}

function insertUsers(db: Database): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (email, password_hash, role) VALUES (?, ?, ?)',
  );
  for (const user of SEED_USERS) {
    insertUser.run(user.email, bcrypt.hashSync(user.password, BCRYPT_COST), user.role);
  }
}

function countRows(db: Database, table: 'orders' | 'order_items'): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

function seedOrders(db: Database, reset: boolean): void {
  const random = createRandom(SEED_VALUE);
  const nowMs = Date.now();
  const insertOrder = db.prepare(
    `INSERT INTO orders
      (customer_name, customer_name_lc, customer_email, customer_email_lc, status, total_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
  );

  const insertBatch = (size: number): void => {
    for (let count = 0; count < size; count += 1) {
      const order = generateOrder(random, nowMs);
      const result = insertOrder.run(
        order.customerName,
        order.customerName.trim().toLowerCase(),
        order.customerEmail,
        order.customerEmail.trim().toLowerCase(),
        order.status,
        order.totalCents,
        order.createdAt,
      );
      const orderId = Number(result.lastInsertRowid);
      for (const item of order.items) {
        insertItem.run(orderId, item.productName, item.quantity, item.unitPriceCents);
      }
    }
  };

  const run = db.transaction(() => {
    if (reset) {
      db.exec('DELETE FROM idempotency_keys');
      db.exec('DELETE FROM order_items');
      db.exec('DELETE FROM orders');
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items')");
    }
    for (let inserted = 0; inserted < ORDER_COUNT; inserted += BATCH_SIZE) {
      insertBatch(Math.min(BATCH_SIZE, ORDER_COUNT - inserted));
    }
  });
  run();
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== '--reset');
  if (unknownArgs.length > 0) {
    console.error(`Unknown argument(s): ${unknownArgs.join(' ')}. Only --reset is supported.`);
    return 1;
  }
  const reset = args.includes('--reset');
  let db: Database | undefined;
  try {
    db = openDatabase(loadConfig().dbPath);
    insertUsers(db);
    console.log(`Users ready: ${SEED_USERS.map((user) => user.email).join(', ')}`);
    const existingOrders = countRows(db, 'orders');
    if (existingOrders > 0 && !reset) {
      console.log(`Orders already exist (${existingOrders}). Nothing to do. Use --reset to reseed.`);
      return 0;
    }
    const startedAt = Date.now();
    seedOrders(db, reset);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `Seeded ${countRows(db, 'orders')} orders with ${countRows(db, 'order_items')} items in ${elapsedMs} ms.`,
    );
    return 0;
  } catch (error) {
    console.error('Seed failed:', error instanceof Error ? error.message : 'unknown error');
    return 1;
  } finally {
    db?.close();
  }
}

process.exitCode = main(process.argv);
