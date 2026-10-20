# SARH Orders Console — Junior track

React 18 + TypeScript frontend, Express 4 + Node 24 backend, and a real SQLite
database. Agents can search, filter, sort, page through and create orders; admins
can also delete individual orders. The server enforces both authentication and
authorization.

## Install and run

Tested on Windows with **Node 24.14.0 and npm 11.9.0**. Use Node 24
(`.nvmrc` is provided). From this directory:

```powershell
npm ci
npm run setup
npm run seed
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/health
- Browser requests use `/api` through Vite's same-origin proxy. No CORS setup.
- Both services bind to loopback. Stop the foreground development command with Ctrl+C.
- `npm run setup` creates a random local JWT secret and never overwrites an
  existing `.env`. Never commit `.env`, databases or node_modules.
- SQLite lives at `server/data/orders.db` by default. `DB_PATH` is relative to
  `server/`, independent of the terminal's current directory.
- Schema migration runs on database open and uses `CREATE ... IF NOT EXISTS`.
  There is no destructive migration or separate migration service.
- Seed creates 50,000 orders and both users. Running it again preserves existing
  orders and users. Do **not** use `npm run seed -- --reset` on valuable data:
  that explicit maintenance option deletes all orders, items and keys.
- A native SQLite prebuilt binary installed successfully on this Windows/Node
  combination. On other platforms a missing prebuild may require C++ build tools.

Local development credentials (synthetic assessment data only):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@sarh.test` | `Admin#12345` |
| Agent | `agent@sarh.test` | `Agent#12345` |

## Sign up

Choose **Create an account** on the sign-in screen. Enter an email, a password
of at least 8 characters (maximum 72 UTF-8 bytes), and matching confirmation.
Successful registration signs you in immediately with **Agent** permissions.
Public registration cannot create admins; role injection is rejected.

`POST /api/auth/signup` accepts `{email,password}`, normalizes email and stores
a bcrypt cost-10 hash. It returns 201 `{user}` and the same HttpOnly,
SameSite=Strict, 15-minute session cookie used by login. Invalid input returns
400; an existing email returns 409 `EMAIL_IN_USE`, including simultaneous
registrations. A database unique constraint enforces that guarantee.
Registration allows ten attempts per IP per 15 minutes, including successes
(disabled in test mode). There is no email verification, invitation requirement
or password reset. This user-requested addition enables public Agent access to
the console, and duplicate-email feedback reveals whether an account exists.
After an uncertain registration response, sign in with the submitted credentials;
registration itself does not use order idempotency keys.

## Checks and production build

```powershell
npm run typecheck
npm test
npm run build
npm run verify:db
npm run prove:duplicates
npm run test:e2e
```

`verify:db` reads the configured database without modifying it. It checks all
totals, 1–5 items per order, five statuses, canonical UTC dates, SQLite integrity,
foreign keys, seeded credentials/hash cost and real query plans.

`prove:duplicates` requires the running development API and seeded agent. It
logs in, handles the token cookie, sends two identical parallel requests and
then 20 retries, checks the same order identity, rejects changed-body reuse
with 422 and verifies a new key creates a new order. It deliberately leaves two
`proof-<uuid>` orders. `BASE_URL` can override the API address.

`test:e2e` requires **Google Chrome** installed and a completed `npm run build`.
It starts an isolated API on 4100 and Vite on 5174, seeds a temporary file-backed
database, runs browser scenarios and removes only its own temporary database.
The regular 4000/5173 services and local database are untouched. Ports 4100 and
5174 must be free. For a machine without Chrome, install it or explicitly adapt
the Playwright browser channel; no browser download is hidden in `npm ci`.

`npm run build` compiles the API and copies `schema.sql`, then builds the client.
`npm start` runs the compiled API only. To inspect the compiled client locally,
start `npm start` in one terminal and the following in another:

```powershell
npm exec --workspace client -- vite preview --port 5173
```

The preview inherits Vite's API proxy. This is a local review path, not a
deployment recipe; no external deployment has been performed.

## Orders and indexes

`GET /api/orders` accepts `q`, `status`, `sort=created_at|total_cents`,
`dir=asc|desc`, `cursor` and `limit`. Default page size is 50; limits outside
1–100 are rejected. Search is a trimmed, case-insensitive name/email contains
match, with `%`, `_` and `\` treated literally. Sort columns are whitelisted,
values are parameterized and cursors are validated.

Keyset pagination uses `(sort column, id)` in the same direction for both
values. SQL fetches at most `limit + 1` rows; item counts are correlated indexed
lookups on the page, not a whole-table join. The browser requests pages as
needed and never prefetches the entire table. There is no total-count query.

| Index | Query served |
|---|---|
| `idx_orders_created` | Date sort and keyset pagination without a status |
| `idx_orders_status_created` | Status equality plus date sort/keyset |
| `idx_orders_total` | Amount sort/keyset without a status |
| `idx_orders_status_total` | Status equality plus amount sort/keyset |
| `idx_items_order` | Page item counts and dependent item deletion |
| `PRIMARY KEY (user_id, key)` | Unique idempotency key per authenticated user |
| `users.email` unique index | Login lookup |

The leading-wildcard contains search is a filtered scan. Token-based SQLite
FTS5 is **not** a drop-in replacement for arbitrary substring matching; a
trigram search design would require separate semantics and measurements.
Actual EXPLAIN results are recorded in `docs/evidence/database-verification.txt`.

Search waits 300 ms after the latest query change. Filter/sort changes invalidate
old requests immediately, even during that interval. An AbortController plus
generation check protects success, error and loading state, including Load more.
The development-only **Simulate slow network** checkbox adds randomized delays
up to 2500 ms. The API ignores `_delayMs` in production.

## Creating orders and avoiding duplicates

Client validation and Zod server validation enforce 1–5 items, quantities
1–1000, prices 0–10,000,000 cents, trimmed names 1–120 characters and a valid
email of at most 254 characters. Decimal prices are parsed as strings into
integer cents. The server calculates totals and ignores submitted totals,
status, ids and timestamps. New orders are pending.

Each normalized form submission gets a UUID v4 `Idempotency-Key`. A SHA-256
hash covers normalized name/email/items in stable property order. One
`BEGIN IMMEDIATE` transaction looks up the user's key, compares the hash and
either replays the stored order, rejects changed-body reuse, or inserts the
order, items and unique key atomically. No partial order survives rollback.
The database uniqueness constraint is the final backstop.

- New order: 201. Same user/key/body: 200 with the same order identity and
  `Idempotent-Replayed: true`. Same key/different body: 422.
- Double-clicks are guarded synchronously and by a disabled button.
- Timeout (10 seconds), network failure and 5xx preserve the body/key for Retry.
- Pending body/key are saved in sessionStorage before transmission. Reload or
  expiry followed by same-user login restores Retry. Success or 422 clears it.
- Explicit logout or a different user clears the pending attempt.
- Replays return the stored order's current state, not a permanently cached response.

## Security review and token storage

The original five-page `SARH_FullStack_Take-Home_Test_v2.pdf` was read from the
candidate-provided Downloads path during integration. The section 3 snippet was
checked against the earlier `imp3.txt` review and the integrated implementation.
The detailed review is in [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

| Reported finding | Severity | Implemented correction / remaining limit |
|---|---|---|
| Hardcoded signing secret | High | Random local secret from setup; required config, ignored `.env`. No rotation UI. |
| `jwt.decode` used for authentication | Critical | `jwt.verify`, signature and claim validation; forged/wrong-secret tokens rejected. |
| No expiry | High | 15-minute JWT and cookie; missing or expired `exp` rejected. No refresh/revocation. |
| Algorithm not pinned | Medium | HS256 explicitly pinned for signing and verification; unsigned tokens rejected. |
| Token accepted from query string | Medium | Only the HttpOnly cookie is accepted; query and Authorization header are ignored. |
| Direct password comparison | Critical | bcrypt cost 10 hashes, email-only parameterized lookup, bcrypt compare and dummy-hash compare for missing users. The snippet compares raw credentials; its unshown data layer does not establish exact storage behavior. |
| Admin check only in React | Critical | Server role guard on DELETE; agent 403, admin 204, absent cookie 401. |
| Unvalidated login/delete input | High | Bounded Zod input shapes, positive integer ids, parameterized SQL; no unsupported claim that the original ORM was SQL-injectable. |
| No brute-force protection | High | 10 failed logins/15 min/IP, safe 429; in-memory/per-process, disabled only in test config. |
| Express 4 async error handling missing | High | Async routes catch and forward errors; safe consistent JSON, malformed/oversized JSON rejected; SQLITE_BUSY maps to retryable 503. |
| Entire unverified token trusted as user | High | Only validated id/role copied; `/me` checks current DB user. Role/deleted-user access can remain valid on order routes until expiry. |
| Token in JSON, numeric subject, unconditional delete success, inconsistent errors | Low | Cookie-only login response, string JWT subject, 204/404 deletion, `{error:{code,message,details?}}`; no stack/SQL returned. |

**Token-storage answer:** The token is stored in an HttpOnly, SameSite=Strict
cookie, reducing token theft through JavaScript and preventing most cross-site
cookie requests. CSRF protection relies on SameSite alone; XSS can still act as
the signed-in user, and same-site threats are not fully prevented. Secure cookies
are disabled for localhost HTTP and default to enabled in production when
`COOKIE_SECURE` is absent; the supplied local `.env` explicitly sets false.

Additional boundaries: no token in localStorage or sessionStorage; only the
pending draft/key use sessionStorage and therefore hold customer data until
cleared or the tab closes. Login errors do not reveal whether the email exists.
The dummy compare reduces timing differences without claiming constant time.
API responses reaching the API middleware use `Cache-Control: no-store`;
JSON parser errors occur before that middleware. React renders values as text.
No CORS middleware, raw HTML rendering, remote analytics or third-party assets.

## Decisions, assumptions and provenance

[DECISIONS.md](DECISIONS.md) records three actual engineering decisions,
alternatives and limits, including server idempotency. These are implementation
tradeoffs, not an invented account of the candidate's personal reasoning.

- Display currency is USD. Total is computed from line items instead of typed.
- Seed PRNG is fixed; dates are offsets from seed runtime, so absolute timestamps
  differ across runs. Default seed created 149,622 items.
- The contract's Node 20 was an earlier engineering choice. The installed Node
  24 was retained and the SQLite dependency updated for compatibility. Express 4,
  React 18, SQLite and the supplied structure were retained.
- Inputs were `OUTPUTS/{integrator,imp1,imp2,imp3,imp4,projectLead}.txt` and
  `BlockB-FINAL.txt`. No original inputs were modified; no archives were present.
- The original PDF was subsequently supplied at
  `C:\Users\Precision 5550\Downloads\SARH_FullStack_Take-Home_Test_v2.pdf`.
  All five pages were read, with pages 2–3 also rendered for visual inspection.
  [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) maps its mandatory scope to evidence.

**AI-use disclosure:** Earlier AI deliveries supplied the scaffold, database/list,
create/idempotency, authentication/security and React code. Codex extracted and
reviewed those deliveries, completed integration, updated dependencies, repaired
request races, added tests, ran local verification and wrote these documents.
At the candidate's later request, Codex also implemented and tested public
Agent sign-up; this addition is not an original assessment requirement.
No claim is made that the candidate personally wrote, reviewed or understood
each part. **Candidate confirmation required:** verify this disclosure against
the tools actually used, review all code and explain the implementation in
your own words before submission.

## Product question — candidate personal review required

I would ask what problem deletion solves: clutter, reporting accuracy, storage, or something else.  
I would clarify retention, audit, refund requirements, who may delete, and whether recovery is necessary.  
If those questions cannot be answered, I would propose hiding cancelled orders by default with a reversible archive option, rather than permanent deletion.

This three-line draft was provided by the candidate for personal review.
It answers the written question; no bulk-delete or archive feature was implemented.

## What was skipped and known limits

- O1 (slow stats) and O2 (optimistic create) were intentionally skipped to focus
  on mandatory R1/R2; the brief explicitly permits skipping both. SCALE.md is
  senior-only and excluded for this Junior submission.
- No Docker or deployment: neither is needed for the local assessment.
  No email/submission or remote push was performed by Codex.
  Git currently has one inspected commit, `8cde75b`, plus subsequent local
  changes. Preserve that history and commit reviewed changes honestly;
  historical incremental development cannot be reconstructed.
- Keys never expire; deleting an order cascades to its key and allows later
  recreation with that key. Different keys/users or deliberate new submissions
  can create equivalent orders. Editing after an ambiguous failure can create a
  second order. Explicit logout/tab closure/storage denial can lose retry context.
- This is not semantic/business duplicate detection. The live proof is concurrent
  HTTP to one synchronous SQLite Node process, not a multi-process stress test.
- Contains search scans; no virtualized DOM or fixed cap on repeatedly loaded
  pages, though every server request is bounded. No live snapshot isolation
  across pages during external inserts/deletes. No benchmark at millions of rows.
- Signed roles are cached up to 15 minutes. No MFA, refresh, revocation, password
  reset, audit log, TLS termination, CSP hardening or additional CSRF token.
  bcrypt considers at most 72 password bytes. Rate limits are per IP/process;
  the local proxy makes browser clients share the same IP.
- Setup, seeds and tests are local-only. Edge assertions passed but its browser
  profile cleanup hung; the supported automated run uses Chrome instead.
- The candidate reports under two hours of personal active work as of
  20 October 2026. Combined effort across earlier deliveries and integration
  was not independently measured. The brief specifies about five hours and
  stopping if past six; this is not a certification of cumulative compliance.

## Evidence and submission work

See [docs/evidence/README.md](docs/evidence/README.md) for actual execution logs,
screenshots and what they prove. A still image does not establish race safety;
controlled request-order assertions and the saved execution report do.

Before submission, the candidate must confirm the product answer, actual work
hours, AI disclosure and the three decisions; review the runnable
code; make honest Git commits; and record the requested walkthrough or select
the required screenshots. The original brief requires a two-minute recording
or three screenshots covering R1 (including rapid filters) and the R2 proof.
Submit the Git link as Junior to `m.alharbi@sarh.ai` by Thursday 22 October 2026,
end of day; the brief does not specify a timezone. Codex has not emailed or pushed.

The complete file-by-file checklist and a ready-to-review submission email are
in [SUBMISSION.md](SUBMISSION.md). Use the actual required filenames
`README.md` and `DECISIONS.md` (not `Read.md` or `Decision.md`).
The three selected screenshots are `01-agent-list.png`, `02-latest-filter.png`
and `04-duplicate-proof.png` under `docs/evidence/`; include their execution
logs and `race-execution.json` so the rapid-filter claim is supported.
