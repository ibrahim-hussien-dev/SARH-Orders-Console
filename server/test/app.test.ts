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

it('registers only agents, hashes passwords and issues a usable session', async () => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/signup')
    .send({ email: ' New@Example.test ', password: 'Signup#123' }).expect(201);
  expect(response.body.user).toMatchObject({ email: 'new@example.test', role: 'agent' });
  expect(Object.keys(response.body.user).sort()).toEqual(['email', 'id', 'role']);
  const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(response.body.user.id) as { password_hash: string };
  expect(bcrypt.compareSync('Signup#123', stored.password_hash)).toBe(true);
  expect(bcrypt.getRounds(stored.password_hash)).toBe(10);
  expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
  await agent.get('/api/orders').expect(200);
  await agent.delete('/api/orders/1').expect(403);
  await agent.post('/api/auth/logout').expect(204);
  await agent.post('/api/auth/login').send({ email: 'new@example.test', password: 'Signup#123' }).expect(200);
});

it('enforces email uniqueness under parallel normalized signups', async () => {
  const responses = await Promise.all(['Parallel@example.test', ' parallel@example.test '].map(email =>
    request(app).post('/api/auth/signup').send({ email, password: 'Signup#123' })));
  expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
  expect(responses.find(r => r.status === 409)?.body.error.code).toBe('EMAIL_IN_USE');
  expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('parallel@example.test')).toEqual({ n: 1 });
});

it.each([
  { email: 'bad', password: 'Signup#123' },
  { email: 'valid@example.test', password: 'short' },
  { email: 'valid@example.test', password: '😀'.repeat(20) },
  { email: 'valid@example.test', password: 'Signup#123', role: 'admin' },
])('rejects invalid signup or privilege injection: %j', async (body) => {
  await request(app).post('/api/auth/signup').send(body).expect(400);
  expect(db.prepare('SELECT id FROM users WHERE email = ?').get(body.email)).toBeUndefined();
});

it('rate limits signup attempts including successful account creation', async () => {
  const limited = createApp(db, { port: 0, dbPath: '', jwtSecret: 'test-secret-with-at-least-32-characters',
    nodeEnv: 'development', cookieSecure: false });
  await request(limited).post('/api/auth/signup').send({ email: 'limited@example.test', password: 'Signup#123' }).expect(201);
  for (let i = 0; i < 9; i++) await request(limited).post('/api/auth/signup').send({}).expect(400);
  await request(limited).post('/api/auth/signup').send({}).expect(429);
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
