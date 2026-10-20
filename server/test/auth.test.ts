import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthMiddleware } from '../src/auth/auth.middleware';
import { createAuthRouter } from '../src/auth/auth.routes';
import type { AppConfig } from '../src/config';
import { openDatabase } from '../src/db/connection';
import { errorHandler, notFoundHandler } from '../src/http/errors';
import { createDeleteRouter } from '../src/orders/delete/delete.routes';

interface Credentials {
  email: string;
  password: string;
}

interface OrderFootprint {
  orders: number;
  items: number;
  keys: number;
}

const SECRET = 'unit-test-secret-that-is-at-least-32-chars';
const OTHER_SECRET = 'a-different-secret-that-is-also-32-chars';
const ADMIN: Credentials = { email: 'admin@test.local', password: 'Admin#12345' };
const AGENT: Credentials = { email: 'agent@test.local', password: 'Agent#12345' };
const FIXTURE_BCRYPT_COST = 4;

let tempDir = '';
let db: Database;
let config: AppConfig;
let app: Express;
let secureApp: Express;
let limitedApp: Express;
let adminId = 0;
let agentId = 0;
let protectedOrderId = 0;

function buildApp(database: Database, appConfig: AppConfig): Express {
  const instance = express();
  const auth = createAuthMiddleware(appConfig);
  instance.use(express.json({ limit: '100kb' }));
  instance.use(cookieParser());
  instance.use('/api/auth', createAuthRouter(database, appConfig));
  instance.use('/api/orders', auth.requireAuth, createDeleteRouter(database, auth));
  instance.use(notFoundHandler);
  instance.use(errorHandler);
  return instance;
}

function insertUser(database: Database, credentials: Credentials, role: 'admin' | 'agent'): number {
  const hash = bcrypt.hashSync(credentials.password, FIXTURE_BCRYPT_COST);
  const result = database
    .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run(credentials.email, hash, role);
  return Number(result.lastInsertRowid);
}

function insertOrderWithDependents(database: Database, userId: number): number {
  const createdAt = new Date().toISOString();
  const orderResult = database
    .prepare(
      `INSERT INTO orders
        (customer_name, customer_name_lc, customer_email, customer_email_lc, status, total_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('Test Customer', 'test customer', 'test@example.com', 'test@example.com', 'pending', 500, createdAt);
  const orderId = Number(orderResult.lastInsertRowid);
  database
    .prepare(
      'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
    )
    .run(orderId, 'Widget', 2, 250);
  database
    .prepare(
      'INSERT INTO idempotency_keys (user_id, key, request_hash, order_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(userId, randomUUID(), 'fixture-hash', orderId, createdAt);
  return orderId;
}

function footprint(database: Database, orderId: number): OrderFootprint {
  const count = (sql: string): number => (database.prepare(sql).get(orderId) as { n: number }).n;
  return {
    orders: count('SELECT COUNT(*) AS n FROM orders WHERE id = ?'),
    items: count('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?'),
    keys: count('SELECT COUNT(*) AS n FROM idempotency_keys WHERE order_id = ?'),
  };
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signTestToken(subject: string, role: string, secret: string = SECRET): string {
  return jwt.sign({ role }, secret, { subject, algorithm: 'HS256', expiresIn: '15m' });
}

function readSetCookies(response: request.Response): string[] {
  const raw: unknown = response.headers['set-cookie'];
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
}

function findTokenCookie(response: request.Response): string | undefined {
  return readSetCookies(response).find((cookie) => cookie.startsWith('token='));
}

function cookieAttributes(cookie: string): string[] {
  return cookie
    .split(';')
    .slice(1)
    .map((part) => part.trim());
}

async function loginCookie(target: Express, credentials: Credentials): Promise<string> {
  const response = await request(target).post('/api/auth/login').send(credentials);
  const tokenCookie = findTokenCookie(response);
  if (response.status !== 200 || !tokenCookie) {
    throw new Error(`Login fixture failed with status ${response.status}`);
  }
  const [pair = ''] = tokenCookie.split(';');
  return pair;
}

function expectUnauthenticated(response: request.Response): void {
  expect(response.status).toBe(401);
  expect(response.body.error.code).toBe('UNAUTHENTICATED');
}

const rejectedTokenCases: Array<[string, () => string]> = [
  ['signed with the wrong secret', () => signTestToken(String(adminId), 'admin', OTHER_SECRET)],
  [
    'a forged payload re-using a real signature',
    () => {
      const [header, , signature] = signTestToken(String(agentId), 'agent').split('.');
      const nowSeconds = Math.floor(Date.now() / 1000);
      const forgedPayload = base64Url({
        sub: String(adminId),
        role: 'admin',
        iat: nowSeconds,
        exp: nowSeconds + 900,
      });
      return `${header}.${forgedPayload}.${signature}`;
    },
  ],
  [
    'unsigned with alg none',
    () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const header = base64Url({ alg: 'none', typ: 'JWT' });
      const payload = base64Url({ sub: String(adminId), role: 'admin', exp: nowSeconds + 900 });
      return `${header}.${payload}.`;
    },
  ],
  [
    'expired',
    () =>
      jwt.sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, {
        subject: String(adminId),
        algorithm: 'HS256',
      }),
  ],
  [
    'validly signed but without an expiry',
    () => jwt.sign({ role: 'admin' }, SECRET, { subject: String(adminId), algorithm: 'HS256' }),
  ],
  ['using a non-numeric subject', () => signTestToken('abc', 'admin')],
  ['using subject zero', () => signTestToken('0', 'admin')],
  ['using a fractional subject', () => signTestToken('1.5', 'admin')],
  ['using a negative subject', () => signTestToken('-1', 'admin')],
  ['carrying an unknown role', () => signTestToken(String(adminId), 'superuser')],
  [
    'missing the role claim',
    () => jwt.sign({}, SECRET, { subject: String(adminId), algorithm: 'HS256', expiresIn: '15m' }),
  ],
  [
    'missing the subject claim',
    () => jwt.sign({ role: 'admin' }, SECRET, { algorithm: 'HS256', expiresIn: '15m' }),
  ],
];

const invalidLoginBodies: Array<[string, unknown]> = [
  ['an object as email', { email: { $ne: null }, password: 'x' }],
  ['a number as password', { email: ADMIN.email, password: 12345 }],
  ['an email longer than 254 characters', { email: `${'a'.repeat(250)}@x.io`, password: 'x' }],
  ['a password longer than 128 characters', { email: ADMIN.email, password: 'p'.repeat(129) }],
  ['no fields', {}],
];

const invalidOrderIds = ['abc', '1.5', '0', '-1', '1e3', '99999999999999999999'];

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarh-auth-'));
  const dbPath = path.join(tempDir, 'auth-test.db');
  config = { port: 0, dbPath, jwtSecret: SECRET, nodeEnv: 'test', cookieSecure: false };
  db = openDatabase(dbPath);
  adminId = insertUser(db, ADMIN, 'admin');
  agentId = insertUser(db, AGENT, 'agent');
  protectedOrderId = insertOrderWithDependents(db, adminId);
  app = buildApp(db, config);
  secureApp = buildApp(db, { ...config, cookieSecure: true });
  limitedApp = buildApp(db, { ...config, nodeEnv: 'development' });
});

afterAll(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('authentication', () => {
  it('logs in with valid credentials and returns only the safe user', async () => {
    const response = await request(app).post('/api/auth/login').send(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: adminId, email: ADMIN.email, role: 'admin' } });
    expect(findTokenCookie(response)).toBeDefined();
  });

  it('issues an HS256 token that expires after 15 minutes', async () => {
    const cookie = await loginCookie(app, AGENT);
    const decoded = jwt.verify(cookie.slice('token='.length), SECRET, {
      algorithms: ['HS256'],
      complete: true,
    });
    const payload = decoded.payload;
    if (typeof payload === 'string') {
      throw new Error('Unexpected string payload');
    }
    expect(decoded.header.alg).toBe('HS256');
    expect(payload.sub).toBe(String(agentId));
    expect(payload.role).toBe('agent');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900);
  });

  it('lower-cases the email before lookup', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email.toUpperCase(), password: ADMIN.password });
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(adminId);
  });

  it('returns the full safe user from /me without a password hash', async () => {
    const cookie = await loginCookie(app, ADMIN);
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: adminId, email: ADMIN.email, role: 'admin' } });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('$2');
  });

  it('answers 401 from /me when there is no cookie', async () => {
    expectUnauthenticated(await request(app).get('/api/auth/me'));
  });

  it('gives identical 401 responses for a wrong email and a wrong password', async () => {
    const wrongEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: ADMIN.password });
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'wrong-password' });
    expect(wrongEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongEmail.body).toEqual(wrongPassword.body);
    expect(readSetCookies(wrongEmail)).toEqual([]);
    expect(readSetCookies(wrongPassword)).toEqual([]);
  });

  it.each(invalidLoginBodies)('rejects a login body with %s using 400', async (_name, body) => {
    const response = await request(app).post('/api/auth/login').send(body as object);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets an httpOnly, SameSite=Strict, path-wide cookie lasting 15 minutes', async () => {
    const response = await request(app).post('/api/auth/login').send(AGENT);
    const cookie = findTokenCookie(response) ?? '';
    const attributes = cookieAttributes(cookie);
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
    expect(attributes).toContain('Path=/');
    expect(attributes).toContain('Max-Age=900');
    expect(attributes).not.toContain('Secure');
  });

  it('adds the Secure flag when the config asks for it', async () => {
    const response = await request(secureApp).post('/api/auth/login').send(AGENT);
    expect(cookieAttributes(findTokenCookie(response) ?? '')).toContain('Secure');
  });

  it('clears the cookie on logout with matching attributes', async () => {
    const response = await request(secureApp).post('/api/auth/logout');
    expect(response.status).toBe(204);
    const cookie = findTokenCookie(response) ?? '';
    const attributes = cookieAttributes(cookie);
    expect(cookie.split(';')[0]).toBe('token=');
    expect(attributes).toContain('Path=/');
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
    expect(attributes).toContain('Secure');
    expect(attributes.some((attribute) => attribute.startsWith('Expires=Thu, 01 Jan 1970'))).toBe(true);
    expect(attributes.some((attribute) => attribute.startsWith('Max-Age'))).toBe(false);
  });

  it('ignores a valid token that is only in the query string', async () => {
    const token = signTestToken(String(adminId), 'admin');
    expectUnauthenticated(await request(app).get(`/api/auth/me?token=${token}`));
  });

  it('ignores a valid token that is only in the Authorization header', async () => {
    const token = signTestToken(String(adminId), 'admin');
    expectUnauthenticated(
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`),
    );
  });

  it.each(rejectedTokenCases)('rejects a token that is %s', async (_name, buildToken) => {
    const cookie = `token=${buildToken()}`;
    expectUnauthenticated(await request(app).get('/api/auth/me').set('Cookie', cookie));
    expectUnauthenticated(
      await request(app).delete(`/api/orders/${protectedOrderId}`).set('Cookie', cookie),
    );
    expect(footprint(db, protectedOrderId).orders).toBe(1);
  });

  it('rejects a validly signed token whose user no longer exists', async () => {
    const cookie = `token=${signTestToken('999999', 'admin')}`;
    expectUnauthenticated(await request(app).get('/api/auth/me').set('Cookie', cookie));
  });

  it('blocks the eleventh login after ten failed attempts when the limiter is active', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await request(limitedApp)
        .post('/api/auth/login')
        .send({ email: AGENT.email, password: 'wrong-password' });
      expect(failed.status).toBe(401);
    }
    const blocked = await request(limitedApp).post('/api/auth/login').send(AGENT);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(readSetCookies(blocked)).toEqual([]);
  });
});

describe('DELETE /api/orders/:id', () => {
  it('answers 401 without a cookie and keeps the order', async () => {
    const orderId = insertOrderWithDependents(db, adminId);
    expectUnauthenticated(await request(app).delete(`/api/orders/${orderId}`));
    expect(footprint(db, orderId)).toEqual({ orders: 1, items: 1, keys: 1 });
  });

  it('answers 403 for an agent and keeps the order', async () => {
    const orderId = insertOrderWithDependents(db, adminId);
    const cookie = await loginCookie(app, AGENT);
    const response = await request(app).delete(`/api/orders/${orderId}`).set('Cookie', cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(footprint(db, orderId)).toEqual({ orders: 1, items: 1, keys: 1 });
  });

  it('lets an admin delete an order and cascades to items and idempotency keys', async () => {
    const orderId = insertOrderWithDependents(db, adminId);
    const cookie = await loginCookie(app, ADMIN);
    const response = await request(app).delete(`/api/orders/${orderId}`).set('Cookie', cookie);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(footprint(db, orderId)).toEqual({ orders: 0, items: 0, keys: 0 });
  });

  it('answers 404 for an order that does not exist', async () => {
    const cookie = await loginCookie(app, ADMIN);
    const response = await request(app).delete('/api/orders/987654321').set('Cookie', cookie);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it.each(invalidOrderIds)('answers 400 for the id %s', async (id) => {
    const cookie = await loginCookie(app, ADMIN);
    const response = await request(app).delete(`/api/orders/${id}`).set('Cookie', cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores an admin token that is only in the Authorization header', async () => {
    const orderId = insertOrderWithDependents(db, adminId);
    const token = signTestToken(String(adminId), 'admin');
    const response = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    expectUnauthenticated(response);
    expect(footprint(db, orderId).orders).toBe(1);
  });

  it('ignores an admin token that is only in the query string', async () => {
    const orderId = insertOrderWithDependents(db, adminId);
    const token = signTestToken(String(adminId), 'admin');
    expectUnauthenticated(await request(app).delete(`/api/orders/${orderId}?token=${token}`));
    expect(footprint(db, orderId).orders).toBe(1);
  });
});
