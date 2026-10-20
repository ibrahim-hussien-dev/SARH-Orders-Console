import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config';
import { buildPageQuery } from '../orders/list/list.repository';

const db = new Database(loadConfig().dbPath, { readonly: true, fileMustExist: true });
try {
  const totals = db.prepare(`SELECT COUNT(*) AS orders, SUM(item_count) AS items,
    MIN(item_count) AS minItems, MAX(item_count) AS maxItems,
    SUM(CASE WHEN total_cents != computed_total THEN 1 ELSE 0 END) AS invalidTotals,
    SUM(CASE WHEN typeof(total_cents) != 'integer' THEN 1 ELSE 0 END) AS nonIntegerTotals
    FROM (SELECT o.total_cents, COUNT(i.id) AS item_count,
      COALESCE(SUM(i.quantity * i.unit_price_cents), 0) AS computed_total
      FROM orders o LEFT JOIN order_items i ON i.order_id = o.id GROUP BY o.id)`).get() as {
      orders: number; items: number; minItems: number; maxItems: number;
      invalidTotals: number; nonIntegerTotals: number;
    };
  assert(totals.orders >= 50000);
  assert(totals.minItems >= 1 && totals.maxItems <= 5);
  assert.equal(totals.invalidTotals, 0);
  assert.equal(totals.nonIntegerTotals, 0);
  const statuses = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all();
  assert.equal(statuses.length, 5);
  let invalidDates = 0;
  for (const raw of db.prepare('SELECT created_at FROM orders').iterate()) {
    const date = (raw as { created_at: string }).created_at;
    const parsed = new Date(date);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== date || parsed.getTime() > Date.now()) {
      invalidDates++;
    }
  }
  assert.equal(invalidDates, 0);
  const foreignKeyErrors = db.pragma('foreign_key_check');
  assert.deepEqual(foreignKeyErrors, []);
  const integrity = db.pragma('integrity_check', { simple: true });
  assert.equal(integrity, 'ok');
  const users = db.prepare('SELECT email,password_hash,role FROM users ORDER BY id').all() as
    Array<{ email: string; password_hash: string; role: string }>;
  for (const [email, password, role] of [
    ['admin@sarh.test', 'Admin#12345', 'admin'],
    ['agent@sarh.test', 'Agent#12345', 'agent'],
  ]) {
    const user = users.find((candidate) => candidate.email === email);
    assert(user && user.role === role && bcrypt.compareSync(password!, user.password_hash));
    assert.equal(bcrypt.getRounds(user.password_hash), 10);
  }
  const plans = ['created_at', 'total_cents'].map((sort) => {
    const { sql, args } = buildPageQuery({
      sort: sort as 'created_at' | 'total_cents', dir: 'desc', status: 'paid',
      q: undefined, cursor: undefined, fetchLimit: 51,
    });
    return { sort, plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) };
  });
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(), ...totals, statuses, invalidDates, integrity,
    users: users.map(({ email, role }) => ({ email, role })), plans,
  }, null, 2));
  console.log('PASS: file-backed database, totals, item counts, dates, roles and password hashes');
} finally {
  db.close();
}
