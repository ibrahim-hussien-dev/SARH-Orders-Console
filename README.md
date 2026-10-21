# SARH Orders Console — Junior assessment

A local React 18 + TypeScript application with an Express/Node API and file-backed
SQLite. Agents can find and create orders; admins can also delete individual orders.
The two main guarantees are that obsolete list responses cannot replace the latest
selection and retries of the same create attempt cannot create another order.

## Run locally

Prerequisites: **Node 24.14.x or newer within Node 24** (engine: `>=24.14.0 <25`),
npm (tested with **11.9.0**), and Google Chrome for browser tests.

```powershell
npm ci
npm run setup
npm run seed
npm run dev
```

Open **http://localhost:5173**. API health: **http://localhost:4000/api/health**.
Both services bind locally. Vite proxies browser `/api` requests to the API.
Stop the foreground process with Ctrl+C.

| Role | Synthetic email | Password |
|---|---|---|
| Admin | admin@sarh.test | Admin#12345 |
| Agent | agent@sarh.test | Agent#12345 |

Accounts are seeded; **public sign-up is not available**. This is an internal
operations console containing customer information. The earlier registration
feature was removed, including its API, and a test asserts it cannot create accounts.

`setup` creates a random local JWT secret and preserves an existing `.env`.
Never commit `.env`, database files or `node_modules`. The default SQLite file is
`server/data/orders.db`. Seed creates 50,000 orders with 1–5 items and both users;
normal reruns preserve existing orders. **Do not use `--reset` on valuable data.**

Configuration is documented in `.env.example`: `PORT`, `DB_PATH`,
`JWT_SECRET` (required, at least 32 characters), `NODE_ENV`, `COOKIE_SECURE`.
Relative DB paths resolve from `server/`. Local HTTP uses Secure=false.
Production defaults Secure=true only when the explicit override is absent.

## Tests and build

```powershell
npm run typecheck
npm test
npm run build
npm run verify:db
npm run prove:duplicates
npm run test:e2e
```

- Typecheck covers server, client, tests and tool configurations.
- Vitest exercises real temporary SQLite databases and deterministic client races.
- `verify:db` is read-only: counts, all totals/item counts, dates, integrity, foreign
  keys, seeded password hashes and actual query plans.
- `prove:duplicates` needs the running API. It logs in, handles the real cookie,
  sends two parallel creates and twenty retries, checks one identity and verifies
  changed-body rejection. **Each run adds two synthetic orders.**
- E2E uses installed Chrome, the compiled API, and its own seeded temporary database
  on ports 4100/5174. Build first; those ports must be free.
- `npm start` runs the compiled API only. In another terminal,
  `npm exec --workspace client -- vite preview --port 5173` serves the built client
  for local review. This is not a production deployment.

Dated results and exact exits are in [docs/evidence](docs/evidence/README.md).
A screenshot is supporting evidence, not proof of request ordering by itself.

## R1: list behavior and indexes

`GET /api/orders` requires authentication and accepts `q`, `status`,
`sort=created_at|total_cents`, `dir=asc|desc`, `cursor` and `limit`.
The default page is 50; the maximum is 100. Search matches customer name/email
case-insensitively, trims input and treats SQL wildcard characters literally.
The default is all statuses, newest first.

Keyset pagination orders by the selected value and ID. The API fetches at most
`limit + 1` rows, returns at most `limit`, and uses the extra row to determine
whether to return a next cursor. The browser never prefetches the entire table.

| Index/constraint | Purpose |
|---|---|
| `idx_orders_created` | Date/ID ordering and cursor |
| `idx_orders_status_created` | Status equality then date/ID |
| `idx_orders_total` | Amount/ID ordering and cursor |
| `idx_orders_status_total` | Status equality then amount/ID |
| `idx_items_order` | Item counts and dependent-item lookup |
| Unique `users.email` | Login lookup |
| Primary key `(user_id,key)` | Durable idempotency uniqueness |

Search has a 300 ms debounce. Filter/sort changes invalidate old requests immediately,
including during debounce. AbortController plus generation checks guard success,
errors and loading updates, including Load more. The development-only **Simulate
slow network** option demonstrates delays; production ignores the API delay option.

Contains search can still scan. Repeated Load more grows the DOM, and multiple pages
are not a snapshot across concurrent inserts/deletes. These limits are intentional.

## R2: validation, idempotency and retry

The form and server enforce 1–5 items, integer quantities 1–1000, unit prices
0–10,000,000 cents, trimmed names 1–120 characters and valid email up to 254.
Decimal inputs are parsed into integer cents. The server computes the total,
sets pending status and UTC creation time, and ignores submitted totals/IDs/status.

One UUID v4 `Idempotency-Key` identifies a create attempt for an authenticated user.
A normalized body hash distinguishes replay from changed-body reuse. One SQLite
immediate transaction inserts the order, items and unique key together.

| Result | Behavior |
|---|---|
| New attempt | 201 with the created order |
| Same user/key/normalized body | 200 with the same identity and `Idempotent-Replayed: true` |
| Same user/key, different body | 422 `IDEMPOTENCY_KEY_REUSED` |
| Network failure, ten-second timeout or 5xx | Client preserves original body/key for explicit Retry |
| Session loss | Same-user login can restore the pending attempt |
| Success, explicit logout or user switch | Pending browser attempt is cleared |

The pending body/key is saved in sessionStorage before sending; it is customer data,
not a token. Storage denial/tab closure can lose retry context. Editing an uncertain
attempt and submitting with a new key can create another business order. Different
keys/users are not deduplicated. Deleting an order removes its key; otherwise keys
do not expire. Replay reads current order data rather than an immutable response.
The proof establishes one-process HTTP behavior, not a distributed stress benchmark.

## Security review and changes

I reviewed the supplied authentication snippet against the implemented routes.
Detailed findings and qualified exploit descriptions are in
[docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

| Problem found | Change and remaining limit |
|---|---|
| Hardcoded secret | Random local secret; validated environment and ignored real configuration. No rotation facility. |
| `jwt.decode` accepted as authentication | Verify signature, allowed HS256 algorithm, expiry, positive subject and supported role. |
| Tokens never expire | 15-minute JWT/cookie; reject missing or expired expiry. No refresh or revocation. |
| No explicit algorithm policy | HS256 pinned on sign and verify; unsigned/forged tokens rejected. |
| Token in query string | Only cookie credentials accepted; URLs and bearer headers are ignored. |
| Direct password comparison | bcrypt cost 10 and parameterized email lookup. The snippet's unseen data layer does not prove plaintext storage. |
| Admin check only in React | Server enforces admin role on DELETE; agents receive 403 even through direct HTTP. |
| Unvalidated input | Zod checks shapes/bounds; valid positive IDs and bound SQL values. The original unnamed ORM does not prove SQL injection. |
| Unlimited failed logins | Ten failures per IP/15 minutes; safe 429. In-memory/per-process, disabled in test mode. |
| Async errors not handled in Express 4 | Catch/forward errors; safe JSON without client stack/SQL. SQLite busy maps to 503. |
| Whole unverified payload trusted | Copy only validated ID/role. `/me` checks current user; order-role claims remain cached until expiry. |
| Token returned in JSON | Set only the session cookie, return safe user fields. |
| Numeric JWT subject | Use a string subject. |
| Unconditional delete success | Return 204 on deletion, 404 when absent; cascade items and keys. |
| Inconsistent errors | Consistent `{error:{code,message,details?}}`; malformed/oversized JSON returns safe 400. |

**Token-storage answer:** I store the session token in an HttpOnly,
SameSite=Strict cookie, which prevents ordinary JavaScript from reading it and
limits cross-site cookie requests. This reduces direct token theft and most
CSRF, but XSS can still act as the signed-in user, and there is no separate
CSRF token or Origin check. Secure is disabled for localhost HTTP and must be
enabled for HTTPS deployment; the explicit local override does not change
automatically just because NODE_ENV changes.

Wrong-email and wrong-password login failures are identical. A dummy bcrypt
comparison reduces timing differences without claiming constant time.
Normal API responses use no-store; parser errors precede that middleware.
React renders text without raw HTML injection. There is no public registration
endpoint exposing email-existence feedback.

## Decisions and AI use

[DECISIONS.md](DECISIONS.md) contains three seven-line decisions, alternatives,
reasons and limits. I used **Claude and Codex** for implementation assistance,
review, integration, automated verification and documentation; the division of
work is disclosed there. My personal active time coordinating this AI-assisted
work was under two hours as reported on 21 October 2026, not a measurement of
total agent runtime.

The code explanation and safe modification examples are in
[docs/CODE_GUIDE.md](docs/CODE_GUIDE.md). It covers the real files, concepts and
request flows; it does not claim that future exercises are implemented.

## Product question

I would ask what problem deletion solves: clutter, reporting accuracy, storage, or something else.  
I would clarify retention, audit, refund requirements, who may delete, and whether recovery is necessary.  
If those questions cannot be answered, I would propose hiding cancelled orders by default with a reversible archive option, rather than permanent deletion.

## What I skipped and why

- I skipped optional O1 slow stats and O2 optimistic create to concentrate on
  mandatory R1/R2 correctness. Neither is required.
- SCALE.md is Senior-only; this is the Junior submission.
- No bulk-delete/archive implementation: the product question asks for judgment.
- No Docker, deployment or hosted service: everything is a local assessment.
- No MFA, password reset, refresh/revocation, audit log, additional CSRF token,
  TLS termination or production monitoring.
- Signed roles can remain effective until expiry. Login rate limits are per
  process/IP; a local proxy makes clients share an apparent address.
- Schema setup is not a versioned migration system; idempotency user IDs have no
  foreign key to users. bcrypt considers at most 72 password bytes.
- No search-at-millions benchmark, full accessibility audit or mobile/browser matrix.

## Evidence

[SUBMISSION.md](SUBMISSION.md) is the short evidence index.
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) maps the original brief to files.
[docs/evidence/final-verification.md](docs/evidence/final-verification.md) records
the verified scope, dates, command results and remaining environment limits.
