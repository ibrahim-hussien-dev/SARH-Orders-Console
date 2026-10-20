import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const AGENT_EMAIL = 'agent@sarh.test';
const AGENT_PASSWORD = 'Agent#12345';
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_COUNT = 20;

interface HttpResult {
  status: number;
  replayed: boolean;
  setCookies: string[];
  body: unknown;
}

interface OrderPayload {
  customerName: string;
  customerEmail: string;
  items: Array<{ productName: string; quantity: number; unitPriceCents: number }>;
}

const loginResponseSchema = z.object({
  user: z.object({
    id: z.number().int().positive(),
    email: z.string(),
    role: z.literal('agent'),
  }),
});

const orderResponseSchema = z.object({
  order: z.object({
    id: z.number().int().positive(),
    customerName: z.string(),
    customerEmail: z.string(),
    status: z.string(),
    totalCents: z.number().int().nonnegative(),
    createdAt: z.string(),
    items: z
      .array(
        z.object({
          id: z.number().int().positive(),
          orderId: z.number().int().positive(),
          productName: z.string(),
          quantity: z.number().int().positive(),
          unitPriceCents: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  }),
});

const listResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      customerName: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

const errorResponseSchema = z.object({
  error: z.object({ code: z.string() }),
});

type OrderResponse = z.infer<typeof orderResponseSchema>['order'];

function report(message: string): void {
  console.log(`ok - ${message}`);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`HTTP ${response.status} response from ${response.url} was not valid JSON`);
  }
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<HttpResult> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: payload === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${method} ${path} did not complete (is the server running at ${BASE_URL}?)`);
  }
  return {
    status: response.status,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
    setCookies: response.headers.getSetCookie(),
    body: await readJson(response),
  };
}

function expectStatus(result: HttpResult, expected: number, label: string): void {
  if (result.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected} but got ${result.status}`);
  }
}

function parseBody<T>(schema: z.ZodType<T>, result: HttpResult, label: string): T {
  const parsed = schema.safeParse(result.body);
  if (!parsed.success) {
    throw new Error(`${label}: response body does not have the expected shape`);
  }
  return parsed.data;
}

function extractTokenCookie(setCookies: string[]): string {
  const tokenCookie = setCookies.find((entry) => entry.startsWith('token='));
  if (tokenCookie === undefined) {
    throw new Error('login: the response did not set a token cookie');
  }
  return tokenCookie.split(';')[0] ?? tokenCookie;
}

async function login(): Promise<string> {
  const result = await call('POST', '/api/auth/login', {}, {
    email: AGENT_EMAIL,
    password: AGENT_PASSWORD,
  });
  expectStatus(result, 200, 'login');
  parseBody(loginResponseSchema, result, 'login');
  return extractTokenCookie(result.setCookies);
}

function buildPayload(customerName: string, quantity: number): OrderPayload {
  return {
    customerName,
    customerEmail: `${customerName}@proof.example`,
    items: [
      { productName: 'Proof widget', quantity, unitPriceCents: 1250 },
      { productName: 'Proof cable', quantity: 1, unitPriceCents: 399 },
    ],
  };
}

function expectedTotalCents(payload: OrderPayload): number {
  return payload.items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

function postOrder(cookie: string, key: string, payload: OrderPayload): Promise<HttpResult> {
  return call('POST', '/api/orders', { Cookie: cookie, 'Idempotency-Key': key }, payload);
}

function parseOrder(result: HttpResult, label: string): OrderResponse {
  return parseBody(orderResponseSchema, result, label).order;
}

function assertOrderMatchesPayload(order: OrderResponse, payload: OrderPayload, label: string): void {
  const matches =
    order.customerName === payload.customerName &&
    order.customerEmail === payload.customerEmail &&
    order.totalCents === expectedTotalCents(payload) &&
    order.items.length === payload.items.length;
  if (!matches) {
    throw new Error(`${label}: the returned order does not match the submitted payload`);
  }
}

function requireSingle(results: HttpResult[], status: number, label: string): HttpResult {
  const matches = results.filter((result) => result.status === status);
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    const seen = results.map((result) => result.status).join(', ');
    throw new Error(`${label}: expected exactly one HTTP ${status} but got statuses [${seen}]`);
  }
  return match;
}

function verifyFirstBatch(results: HttpResult[], payload: OrderPayload): OrderResponse {
  const created = requireSingle(results, 201, 'first batch');
  const replay = requireSingle(results, 200, 'first batch');
  if (created.replayed || !replay.replayed) {
    throw new Error('first batch: the Idempotent-Replayed header is wrong');
  }
  const createdOrder = parseOrder(created, 'first batch 201');
  const replayedOrder = parseOrder(replay, 'first batch 200');
  assertOrderMatchesPayload(createdOrder, payload, 'first batch 201');
  if (JSON.stringify(createdOrder) !== JSON.stringify(replayedOrder)) {
    throw new Error('first batch: the 200 replay differs from the 201 order');
  }
  return createdOrder;
}

function verifyRetries(results: HttpResult[], created: OrderResponse): void {
  const wrongStatuses = results.filter((result) => result.status !== 200);
  if (wrongStatuses.length > 0) {
    const seen = wrongStatuses.map((result) => result.status).join(', ');
    throw new Error(`retries: expected only HTTP 200 but got [${seen}]`);
  }
  for (const result of results) {
    if (!result.replayed) {
      throw new Error('retries: a 200 response is missing the Idempotent-Replayed header');
    }
    if (JSON.stringify(parseOrder(result, 'retry')) !== JSON.stringify(created)) {
      throw new Error('retries: a replay differs from the created order');
    }
  }
}

async function expectExactlyOne(
  cookie: string,
  customerName: string,
  expectedId: number,
  label: string,
): Promise<void> {
  const result = await call(
    'GET',
    `/api/orders?q=${encodeURIComponent(customerName)}&limit=100`,
    { Cookie: cookie },
  );
  expectStatus(result, 200, `${label} (list)`);
  const { items } = parseBody(listResponseSchema, result, `${label} (list)`);
  const [only] = items;
  if (items.length !== 1 || only === undefined || only.id !== expectedId) {
    const ids = items.map((item) => item.id).join(', ');
    throw new Error(
      `${label}: expected exactly one order with id ${expectedId} but found ${items.length} (ids: [${ids}])`,
    );
  }
}

async function verifyChangedBodyRejected(
  cookie: string,
  key: string,
  changedPayload: OrderPayload,
): Promise<void> {
  const result = await postOrder(cookie, key, changedPayload);
  expectStatus(result, 422, 'changed body');
  const { error } = parseBody(errorResponseSchema, result, 'changed body');
  if (error.code !== 'IDEMPOTENCY_KEY_REUSED') {
    throw new Error(`changed body: expected IDEMPOTENCY_KEY_REUSED but got ${error.code}`);
  }
}

async function verifyFreshKeyCreatesNewOrder(
  cookie: string,
  payload: OrderPayload,
  firstOrderId: number,
): Promise<OrderResponse> {
  const result = await postOrder(cookie, randomUUID(), payload);
  expectStatus(result, 201, 'fresh key');
  if (result.replayed) {
    throw new Error('fresh key: a new order must not be marked as replayed');
  }
  const order = parseOrder(result, 'fresh key');
  assertOrderMatchesPayload(order, payload, 'fresh key');
  if (order.id === firstOrderId) {
    throw new Error('fresh key: the new order reused the first order id');
  }
  return order;
}

async function run(): Promise<void> {
  const cookie = await login();
  report('logged in as agent@sarh.test and captured the token cookie');

  const firstName = `proof-${randomUUID()}`;
  const payload = buildPayload(firstName, 2);
  const key = randomUUID();

  const firstBatch = await Promise.all([
    postOrder(cookie, key, payload),
    postOrder(cookie, key, payload),
  ]);
  const created = verifyFirstBatch(firstBatch, payload);
  report(`two parallel requests with one key gave one 201 and one 200 for order ${created.id}`);

  const retries = await Promise.all(
    Array.from({ length: RETRY_COUNT }, () => postOrder(cookie, key, payload)),
  );
  verifyRetries(retries, created);
  report(`${RETRY_COUNT} further parallel retries all returned 200 with the same order`);

  await expectExactlyOne(cookie, firstName, created.id, 'after the retries');
  report('listing by the unique customer name returns exactly one order');

  await verifyChangedBodyRejected(cookie, key, buildPayload(firstName, 3));
  report('same key with a different body returned 422 IDEMPOTENCY_KEY_REUSED');

  const secondName = `proof-${randomUUID()}`;
  const second = await verifyFreshKeyCreatesNewOrder(cookie, buildPayload(secondName, 1), created.id);
  report(`fresh key with a different customer name created a new order ${second.id}`);

  await expectExactlyOne(cookie, firstName, created.id, 'after the 422 and the second order');
  await expectExactlyOne(cookie, secondName, second.id, 'second order');
  report('the first customer name still matches exactly one order');
}

run().then(
  () => {
    console.log('PASS');
    process.exit(0);
  },
  (error: unknown) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(1);
  },
);
