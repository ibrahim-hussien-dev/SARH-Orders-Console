import { test, expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

let server: ChildProcess;
let directory: string;
const evidence = resolve('docs/evidence');
const pendingKey = 'sarh.orders.pendingAttempt.v1';
const errors: string[] = [];
const networkFailures: Array<{ url: string; error: string }> = [];
test.beforeAll(async () => {
  test.setTimeout(60000);
  // Fail before any API action if the isolated test port belongs to another app.
  await new Promise<void>((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(4100, '127.0.0.1', () => probe.close(() => resolvePort()));
  });
  mkdirSync(evidence, { recursive: true });
  directory = mkdtempSync(join(tmpdir(), 'sarh-e2e-'));
  const env = {
    ...process.env, DB_PATH: join(directory, 'orders.db'), PORT: '4100',
    JWT_SECRET: randomBytes(48).toString('hex'), NODE_ENV: 'test', COOKIE_SECURE: 'false',
  };
  execFileSync(process.execPath, ['server/dist/db/seed.js'], { env, stdio: 'pipe' });
  server = spawn(process.execPath, ['server/dist/index.js'], { env, stdio: 'pipe', windowsHide: true });
  server.stderr?.on('data', (chunk) => errors.push(`backend: ${String(chunk)}`));
  await expect.poll(async () => {
    try { return (await fetch('http://127.0.0.1:4100/api/health')).status; } catch { return 0; }
  }).toBe(200);
});
test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill();
    await closed;
  }
  // Only delete the directory created by mkdtemp for this run.
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith('sarh-e2e-')) {
    rmSync(directory, { recursive: true, force: true });
  }
  writeFileSync(join(evidence, 'browser-diagnostics.json'),
    JSON.stringify({ errors, networkFailures, note: 'Aborts during races and injected failures are intentional.' }, null, 2));
});
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // HTTP 401 during initial session discovery and injected failures are expected.
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => networkFailures.push({
    url: request.url(), error: request.failure()?.errorText ?? 'unknown',
  }));
});
test.afterEach(() => expect(errors).toEqual([]));

async function login(page: Page, role: 'admin' | 'agent' = 'agent') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@sarh.test`);
  await page.getByLabel('Password', { exact: true }).fill(role === 'agent' ? 'Agent#12345' : 'Admin#12345');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
}
async function fillOrder(page: Page, name: string) {
  await page.getByLabel('Customer name', { exact: true }).fill(name);
  await page.getByLabel('Customer email', { exact: true }).fill(`${name}@example.com`);
  await page.getByLabel('Product', { exact: true }).fill('Browser widget');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Unit price', { exact: true }).fill('19.99');
}
async function assertLatestRows(page: Page) {
  const params = await page.locator('.filters').evaluate((form) => {
    const controls = form.querySelectorAll('select');
    return { q: (form.querySelector('input[type=search]') as HTMLInputElement).value,
      status: controls[0].value, sort: controls[1].value, dir: controls[2].value };
  });
  const response = await page.request.get(`/api/orders?${new URLSearchParams({ ...params, limit: '50' })}`);
  expect(response.status()).toBe(200);
  const expected = (await response.json()).items.map((item: { id: number }) => String(item.id));
  await expect.poll(() => page.locator('tbody tr td:first-child').allTextContents()).toEqual(expected);
  await expect(page.getByText('Loading orders…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('signup validates confirmation, creates an agent session and rejects duplicate email', async ({ page }) => {
  const email = `signup-${randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Signup#123');
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  await page.getByLabel('Confirm password', { exact: true }).fill('Signup#123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect(page.getByRole('button', { name: /^Delete order/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Signup#123');
  await page.getByLabel('Confirm password', { exact: true }).fill('Signup#123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already has an account');
  await page.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('Signup#123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
});

test('login, bounded pagination, name/email search, all sorts and logout', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: /^Delete order/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(100);
  const ids = await page.locator('tbody tr td:first-child').allTextContents();
  expect(new Set(ids).size).toBe(100);
  await page.getByLabel('Search name or email').fill('oLiViA');
  await assertLatestRows(page);
  const email = await page.locator('tbody tr').first().locator('td').nth(2).innerText();
  await page.getByLabel('Search name or email').fill(email.toUpperCase());
  await assertLatestRows(page);
  await page.getByLabel('Search name or email').fill('');
  for (const sort of ['created_at', 'total_cents']) {
    for (const dir of ['asc', 'desc']) {
      await page.getByLabel('Sort by').selectOption(sort);
      await page.getByLabel('Direction').selectOption(dir);
      await assertLatestRows(page);
    }
  }
  await page.screenshot({ path: join(evidence, '01-agent-list.png') });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/orders')).status()).toBe(401);
});

test('real delayed responses: rapid filters, search debounce and load-more cannot overwrite latest', async ({ page }) => {
  await login(page);
  await page.getByLabel('Simulate slow network').check();
  const responseOrder: string[] = [];
  let releaseOld!: () => void;
  let sawOld!: () => void;
  const oldSeen = new Promise<void>((resolve) => { sawOld = resolve; });
  const oldRelease = new Promise<void>((resolve) => { releaseOld = resolve; });
  // Fetch actual rows from SQLite, hold the old response until after the new one.
  await page.route('**/api/orders?**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('_delayMs', '0');
    const response = await route.fetch({ url: url.toString() });
    if (url.searchParams.get('status') === 'pending') {
      sawOld();
      await oldRelease;
      responseOrder.push('old pending released');
    } else responseOrder.push(`latest ${url.searchParams.get('status')}`);
    await route.fulfill({ response });
  });
  await page.getByLabel('Status', { exact: true }).selectOption('pending');
  await oldSeen;
  await page.getByLabel('Status', { exact: true }).selectOption('paid');
  await page.getByLabel('Sort by').selectOption('total_cents');
  await page.getByLabel('Direction').selectOption('asc');
  await assertLatestRows(page);
  releaseOld();
  await expect.poll(() => responseOrder.includes('old pending released')).toBe(true);
  await assertLatestRows(page);
  await page.unrouteAll({ behavior: 'wait' });

  let releaseMore!: () => void;
  let sawMore!: () => void;
  const moreSeen = new Promise<void>((resolve) => { sawMore = resolve; });
  const moreRelease = new Promise<void>((resolve) => { releaseMore = resolve; });
  let moreFinished = false;
  await page.route('**/api/orders?**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('_delayMs', '0');
    const response = await route.fetch({ url: url.toString() });
    if (url.searchParams.has('cursor')) { sawMore(); await moreRelease; }
    await route.fulfill({ response });
    if (url.searchParams.has('cursor')) moreFinished = true;
  });
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await moreSeen;
  await page.getByLabel('Search name or email').fill('Ol');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByLabel('Search name or email').fill('Olivia');
  await page.getByLabel('Status', { exact: true }).selectOption('shipped');
  releaseMore();
  await expect.poll(() => moreFinished).toBe(true);
  await assertLatestRows(page);
  await page.screenshot({ path: join(evidence, '02-latest-filter.png') });
  writeFileSync(join(evidence, 'race-execution.json'), JSON.stringify({
    responseOrder, finalFilters: { q: 'Olivia', status: 'shipped', sort: 'total_cents', dir: 'asc' },
    verified: 'Displayed IDs equal live API IDs after releasing older first-page and load-more responses.',
    debounce: '300ms boundary, stale errors and loading states additionally covered with deterministic hook tests.',
  }, null, 2));
});

test('client validation, server total and synchronous double-submit guard', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByText('Customer name must be 1 to 120 characters.')).toBeVisible();
  const name = `e2e-${randomUUID()}`;
  await fillOrder(page, name);
  await page.getByLabel('Unit price', { exact: true }).fill('19.999');
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByText('Use at most 2 decimal places.')).toBeVisible();
  await page.getByLabel('Unit price', { exact: true }).fill('19.99');
  let posts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/orders' && request.method() === 'POST') posts++;
  });
  await page.getByRole('button', { name: 'Create order', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click(); button.click();
  });
  await expect(page.getByText(/Order #\d+ created\./)).toBeVisible();
  expect(posts).toBe(1);
  const result = await (await page.request.get(`/api/orders?q=${name}`)).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0].totalCents).toBe(3998);
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('');
});

test('committed order with lost response survives reload and retries the exact key as replay', async ({ page }) => {
  await login(page);
  const name = `retry-${randomUUID()}`;
  await fillOrder(page, name);
  let originalKey = '';
  let committedId = 0;
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    originalKey = route.request().headers()['idempotency-key'];
    const response = await route.fetch(); // Real server commits before the network failure.
    expect(response.status()).toBe(201);
    committedId = (await response.json()).order.id;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.reload();
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue(name);
  const responsePromise = page.waitForResponse((res) =>
    new URL(res.url()).pathname === '/api/orders' && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const replay = await responsePromise;
  expect(replay.request().headers()['idempotency-key']).toBe(originalKey);
  expect(replay.status()).toBe(200);
  expect(replay.headers()['idempotent-replayed']).toBe('true');
  expect((await replay.json()).order.id).toBe(committedId);
  await expect(page.getByText(`Order #${committedId} was already created by an earlier attempt. No duplicate was made.`)).toBeVisible();
  expect((await (await page.request.get(`/api/orders?q=${name}`)).json()).items).toHaveLength(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).toBeNull();
  await page.screenshot({ path: join(evidence, '03-safe-replay.png') });
});

test('pending create survives session expiry for the same user; 422 never auto-resubmits', async ({ page }) => {
  await login(page);
  const name = `expired-${randomUUID()}`;
  await fillOrder(page, name);
  // Simulate a missing session at submit; the draft and key are saved first.
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  const before = await page.evaluate((key) => sessionStorage.getItem(key), pendingKey);
  expect(before).not.toBeNull();
  await page.getByLabel('Email', { exact: true }).fill('agent@sarh.test');
  await page.getByLabel('Password', { exact: true }).fill('Agent#12345');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue(name);
  const stored = JSON.parse(before!);
  const occupied = await page.request.post('/api/orders', {
    headers: { 'Idempotency-Key': stored.key },
    data: { ...stored.body, customerName: `${name}-different` },
  });
  expect(occupied.status()).toBe(201);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText(/already used for a different order/)).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).toBeNull();
  expect((await (await page.request.get(`/api/orders?q=${name}`)).json()).items).toHaveLength(1);
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByText(/Order #\d+ created\./)).toBeVisible();
});

test('admin delete is enforced by API and confirmed in UI on an isolated database', async ({ page }) => {
  await login(page);
  const name = `delete-${randomUUID()}`;
  const created = await page.request.post('/api/orders', {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { customerName: name, customerEmail: `${name}@example.com`,
      items: [{ productName: 'Disposable test fixture', quantity: 1, unitPriceCents: 1 }] },
  });
  const id = (await created.json()).order.id;
  expect((await page.request.delete(`/api/orders/${id}`)).status()).toBe(403);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await login(page, 'admin');
  await page.getByLabel('Search name or email').fill(name);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Delete order ${id}`, exact: true }).click();
  await expect(page.getByText('No orders match these filters.')).toBeVisible();
  expect((await page.request.delete(`/api/orders/${id}`)).status()).toBe(404);
});

test('a stale server error cannot replace the latest successful rows or loading state', async ({ page }) => {
  await login(page);
  let release!: () => void;
  let seen!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { seen = resolve; });
  let finished = false;
  await page.route('**/api/orders?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('status') !== 'cancelled') return route.continue();
    seen();
    await blocked;
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Stale test failure' } }) });
    finished = true;
  });
  await page.getByLabel('Status', { exact: true }).selectOption('cancelled');
  await started;
  await page.getByLabel('Status', { exact: true }).selectOption('delivered');
  await assertLatestRows(page);
  release();
  await expect.poll(() => finished).toBe(true);
  await assertLatestRows(page);
});

test('a real ten-second timeout preserves the key and returns the committed order on retry', async ({ page }) => {
  await login(page);
  await fillOrder(page, `timeout-${randomUUID()}`);
  let firstKey = '';
  let committedId = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    firstKey = route.request().headers()['idempotency-key'];
    const response = await route.fetch();
    committedId = (await response.json()).order.id;
    await blocked;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByText(/timed out after 10 seconds/)).toBeVisible({ timeout: 15000 });
  release();
  await page.unrouteAll({ behavior: 'wait' });
  const responsePromise = page.waitForResponse((res) =>
    new URL(res.url()).pathname === '/api/orders' && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const response = await responsePromise;
  expect(response.request().headers()['idempotency-key']).toBe(firstKey);
  expect(response.status()).toBe(200);
  expect((await response.json()).order.id).toBe(committedId);
});

test('explicit logout and switching users discard pending attempts', async ({ page }) => {
  await login(page);
  await fillOrder(page, `logout-${randomUUID()}`);
  await page.route('**/api/orders', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).not.toBeNull();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).toBeNull();
  await login(page);
  await fillOrder(page, `switch-${randomUUID()}`);
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await login(page, 'admin');
  await expect(page.getByLabel('Customer name', { exact: true })).toHaveValue('');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).toBeNull();
});
