import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/connection';

let directory: string;
let db: Database;
let app: ReturnType<typeof createApp>;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'sarh-app-'));
  const dbPath = join(directory, 'app.db');
  db = openDatabase(dbPath);
  db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)')
    .run('agent@test.local', bcrypt.hashSync('Test#12345', 4), 'agent');
  app = createApp(db, {
    port: 0, dbPath, jwtSecret: 'integration-test-secret-with-at-least-32-characters',
    nodeEnv: 'test', cookieSecure: false,
  });
});
afterAll(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

it('does not serve public sign-up', async () => {
  const response = await request(app).post('/api/auth/signup')
    .send({ email: 'new@example.test', password: 'Signup#123' }).expect(404);
  expect(response.body.error.code).toBe('NOT_FOUND');
  expect(db.prepare('SELECT id FROM users WHERE email = ?').get('new@example.test')).toBeUndefined();
});

it('protects every integrated orders route before its handler', async () => {
  expect((await request(app).get('/api/orders')).status).toBe(401);
  expect((await request(app).post('/api/orders').send({})).status).toBe(401);
  expect((await request(app).delete('/api/orders/1')).status).toBe(401);
});

it('uses a real login cookie for create, replay, list and server-enforced denial', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'agent@test.local', password: 'Test#12345' }).expect(200);
  const key = randomUUID();
  const body = { customerName: 'Integration', customerEmail: 'integration@test.local',
    items: [{ productName: 'Widget', quantity: 2, unitPriceCents: 1999 }] };
  const first = await agent.post('/api/orders').set('Idempotency-Key', key).send(body).expect(201);
  const replay = await agent.post('/api/orders').set('Idempotency-Key', key).send(body).expect(200);
  expect(replay.body.order).toEqual(first.body.order);
  const list = await agent.get('/api/orders?q=Integration').expect(200);
  expect(list.body.items).toHaveLength(1);
  expect(list.body.items[0].totalCents).toBe(3998);
  await agent.delete(`/api/orders/${first.body.order.id}`).expect(403);
  await agent.post('/api/auth/logout').expect(204);
  await agent.get('/api/orders').expect(401);
});

it('returns safe errors for malformed JSON, oversized JSON and missing routes', async () => {
  const malformed = await request(app).post('/api/auth/login').type('json').send('{"broken":').expect(400);
  expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  const oversized = await request(app).post('/api/auth/login').send({ email: 'x'.repeat(110000) }).expect(400);
  expect(oversized.body.error.code).toBe('VALIDATION_ERROR');
  const missing = await request(app).get('/api/missing').expect(404);
  expect(missing.body.error.code).toBe('NOT_FOUND');
  for (const response of [malformed, oversized, missing]) {
    expect(JSON.stringify(response.body)).not.toMatch(/stack|SyntaxError|SELECT/);
  }
});
