# Security Review: Orders Console Authentication

## Sign-up addition (20 October 2026)

User-requested public registration creates Agent accounts only. The server
rejects extra fields such as role, validates normalized email, requires at least
8 password characters and at most 72 UTF-8 bytes, hashes with bcrypt cost 10,
and enforces email uniqueness in SQLite. Ten registration attempts per IP per
15 minutes include successful requests. Sessions use the existing cookie/JWT
policy. No email verification or invitation flow is implemented; public users
can obtain Agent access. A 409 duplicate-email response permits account
enumeration. These are explicit local-assessment limitations.
References below to no password policy describe the original login-only scope;
new registration now enforces the stated length/byte policy.

## Scope and method

This review originated in `OUTPUTS/imp3.txt`. During integration, Codex read all
five pages of the original assessment PDF from the candidate-provided Downloads
path, rendered page 2 and compared its vulnerable snippet to the replacement in
`server/src/auth/*` and `server/src/orders/delete/*`. Evidence labels distinguish
what the snippet actually shows from assumptions about its unshown data layer.

Each finding is labelled by how well it is supported:

- **Proven**: follows directly from the legacy code as written, regardless of backend.
- **Backend-dependent**: the snippet does not show enough (for example, which ORM) to prove it. It is stated as a risk, not a fact.
- **Latent**: harmless in the legacy code only because another bug masks it, and becomes live in a naive fix.

Severity is judged for an internet-reachable operations tool holding customer data.

**Verification status:** Codex ran `npm test`: 129 server tests (including 42 auth
tests) and 6 client race/transport tests passed on Node 24.14.0 / Vitest 4.1.12.
The integrated cookie flow, agent denial and admin deletion were also exercised
in the browser against an isolated file-backed database.

## Summary

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| F1 | Hardcoded signing secret | High | Proven |
| F2 | `jwt.decode` used instead of `jwt.verify` | Critical | Proven |
| F3 | Token has no expiry | High | Proven |
| F4 | Algorithm not pinned | Medium | Latent |
| F5 | Token accepted from URL query string | Medium | Proven |
| F6 | Direct password comparison | Critical | Query confirmed; underlying storage not shown |
| F7 | Admin check only in React | Critical | Proven |
| F8 | No input shape validation (login body, `:id`) | High | Backend-dependent |
| F9 | No brute-force protection | High | Proven |
| F10 | Async handlers without error handling (Express 4) | High | Proven (framework), backend-dependent (trigger) |
| F11 | Whole token payload trusted as `req.user` | High (legacy) | Proven in legacy |
| F12 | Smaller issues: token in JSON body, numeric `sub`, delete always `{ok:true}`, ad-hoc error shape | Low | Proven |

## Findings

### F1. Hardcoded secret (High, proven)

- **Finding:** `const SECRET = 'sarh-secret-2026'` is committed in source.
- **Plausible exploit:** anyone who can read the repository, a backup, or a build artifact can run `jwt.sign({sub:1, role:'admin'}, 'sarh-secret-2026')`. Once verification exists (F2), that token is accepted. In the legacy code the secret is only used by `sign`, so the damage today comes from F2, but the secret becomes the single point of failure as soon as verification is fixed.
- **Fix implemented:** `server/src/config.ts` (owner C) requires `JWT_SECRET` of at least 32 characters and throws when it is missing. `.env.example` leaves it empty and `npm run setup` writes a random value. `.env` is git-ignored (owner B). The secret reaches auth code only through `AppConfig.jwtSecret`.
- **Remaining limit:** the secret sits in a plain `.env` file on disk. There is no rotation mechanism. Rotating it logs everybody out, which is acceptable with 15-minute tokens.

### F2. `jwt.decode` instead of `jwt.verify` (Critical, proven)

- **Finding:** `jwt.decode(token)` only base64-decodes the payload and checks nothing about the signature.
- **Plausible exploit:** an attacker builds `header.payload.anything` with payload `{"sub":1,"role":"admin"}` and sends it as a bearer token or as `?token=`. `decode` returns the payload and `req.user = payload` makes the attacker an admin. The secret is never needed.
- **Fix implemented:** `verifyToken` in `auth.tokens.ts` calls `jwt.verify(token, secret, { algorithms: ['HS256'] })`. Any exception returns `null` and `requireAuth` answers 401. Tests: wrong-secret token, forged payload with a real signature, and `alg:none` token are all rejected.
- **Remaining limit:** security rests on the secrecy of one shared HS256 key. Anyone who can read the key can mint tokens.

### F3. No expiry (High, proven)

- **Finding:** `jwt.sign({sub, role}, SECRET)` sets no `exp`. A token never dies.
- **Plausible exploit:** a token copied from a log, a laptop or a screen share works forever, even after the employee leaves.
- **Fix implemented:** login signs with `expiresIn: '15m'`, and the cookie `Max-Age` is 900 s. `verifyToken` also rejects a validly signed token that has no numeric `exp`, so a token minted without expiry (for example by an old code path) cannot be used. Tests: expired token, no-`exp` token, and the issued token lasting exactly 900 s.
- **Remaining limit:** there is no revocation list and no refresh. A stolen token is usable until it expires, and users sign in again every 15 minutes.

### F4. Algorithm not pinned (Medium, latent)

- **Finding:** the legacy code never states which algorithm it accepts.
- **Why it is latent:** in the legacy code `decode` ignores algorithms entirely, so F2 already accepts everything. The risk becomes real in a partial fix that calls `jwt.verify(token, secret)` without an `algorithms` option. Depending on library version and key type, that can open `alg:none` or algorithm-confusion problems.
- **Fix implemented:** `algorithms: ['HS256']` on verify and `algorithm: 'HS256'` on sign. Test: a hand-built `alg:none` token with an empty signature gets 401.
- **Remaining limit:** none specific, beyond F2's single-key point.

### F5. Token accepted from the URL (Medium, proven)

- **Finding:** `req.query.token` is a valid credential.
- **Plausible exploit:** URLs are stored in browser history, proxy and server access logs, analytics, and `Referer` headers sent to third parties. A token pasted into a ticket or a chat link hands the session to whoever reads it. It also lets an attacker plant a link that logs a victim into the attacker's session.
- **Fix implemented:** `requireAuth` reads only `req.cookies.token`. The `Authorization` header is also ignored on purpose, so there is exactly one credential channel. Tests: valid token in the query string only, and valid token in the header only, are both 401, on `/me` and on `DELETE`.
- **Remaining limit:** non-browser API clients cannot use a bearer header. That is an accepted trade-off for this app.

### F6. Direct password comparison (Critical; original storage unverified)

- **Finding:** the PDF contains `findFirst({ where: { email, password } })`, which appears to compare the submitted password directly. Without the original data layer, hidden middleware or transforms cannot be excluded, so plaintext storage is a concern rather than an independently proven fact.
- **Plausible exploit:** one database leak, backup or SQL read exposes every user's real password, which people reuse elsewhere.
- **Fix implemented:** passwords are stored as bcryptjs hashes (cost 10, seeded by owner C). `auth.repository.ts` finds the user by email with the parameterised `SELECT ... WHERE email = ?` and `auth.service.ts` runs `bcrypt.compare`. When the email is unknown, the compare still runs against a dummy hash created once at process start with the same cost, so the response time is closer for known and unknown emails. Wrong email and wrong password return byte-identical 401 bodies (tested).
- **Remaining limit:** the dummy compare reduces the timing difference but is **not** a claim of exact constant-time behaviour. bcrypt uses only the first 72 bytes of a password. There is no password policy, change or reset flow. Emails are compared after lower-casing and the seed stores them lower-case.

### F7. Authorization only in React (Critical, proven)

- **Finding:** the comment says the admin check lives in the `AdminOnly` React component. The route only has `requireAuth`.
- **Plausible exploit:** any logged-in user (or, because of F2, anyone) can send `DELETE /orders/42` directly with curl and skip the UI entirely.
- **Fix implemented:** `createDeleteRouter` applies `auth.requireRole('admin')`, which compares `req.user.role` to `'admin'` on the server: 401 with no user, 403 for any other role. Tests: no cookie gives 401, agent gives 403 with the order untouched, admin gives 204. The React Delete button stays as a convenience only.
- **Remaining limit:** the role comes from the token (F11), so a demoted admin keeps access until the token expires.

### F8. Input shape validation (High, backend-dependent)

- **Finding:** `req.body.email`, `req.body.password` and `req.params.id` go straight into the data layer with no type or shape check.
- **What is proven and what is not:** the snippet uses an unnamed `db.users.findFirst({ where })` API. It does **not** prove SQL injection and this review does not claim it does. The risk depends on the backend. If the data layer accepts operator objects, an attacker could send `{"email":{"not":""},"password":{"not":""}}` and match the first user (an operator-injection style login bypass). A string `:id` passed where a number is expected can also cause type coercion or an exception (see F10).
- **Fix implemented:** login uses a zod schema (`email` string max 254, `password` string max 128, else 400 `VALIDATION_ERROR`), and the email is lower-cased. All SQL is parameterised in the repository classes. The delete id must match `^[1-9]\d{0,14}$` (positive integer, safe-integer range) or the answer is 400. Tests: object email, numeric password, over-long email and password, empty body, and ids `abc`, `1.5`, `0`, `-1`, `1e3`, and a 20-digit number.
- **Remaining limit:** Zod unknown keys are stripped, not rejected. The integrated create/list routes also validate their own bodies and queries.

### F9. No brute-force protection (High, proven)

- **Finding:** `/login` can be called without limit.
- **Plausible exploit:** an attacker tries a password list against `admin@...` at network speed.
- **Fix implemented:** `express-rate-limit` on `/login`: 10 failed attempts per 15 minutes per IP, `skipSuccessfulRequests: true`, safe 429 `RATE_LIMITED` JSON, disabled when `nodeEnv === 'test'`. A test creates the router with `nodeEnv: 'development'` and checks that the 11th attempt gets 429.
- **Remaining limit:**
  - The counter is in process memory, so it resets on restart and is not shared between instances.
  - It is per IP only. A distributed attacker avoids it, and users behind one NAT share a quota.
  - Without `trust proxy`, everything behind the Vite dev proxy appears as `127.0.0.1`, so in dev all clients share one quota.
  - There is no per-account lockout, on purpose, because it lets an attacker lock real users out.
  - The `skipSuccessfulRequests` behaviour is not covered by a test.

### F10. Async handlers without error handling (High, proven for the framework)

- **Finding:** `async (req, res) => { await db... }` in Express 4. Express 4 does not catch rejected promises from handlers.
- **Plausible exploit:** if the awaited call rejects (for example, deleting a missing record or a bad id), the request never gets an answer. On Node 20 an unhandled rejection terminates the process by default, so one request can take the service down. That a given ORM throws on a missing record is backend-dependent. The Express 4 behaviour is not.
- **Fix implemented:** every async handler wraps its body in `try/catch` and calls `next(error)`. Errors end in B's `errorHandler`, which returns `{error:{code,message}}` and never a stack or SQL text. Missing orders are an explicit 404.
- **Remaining limit:** a process-level `unhandledRejection` handler is not part of this scope.

### F11. Whole token payload trusted as `req.user` (High in legacy, proven)

- **Finding:** `req.user = payload` copies everything from an unverified token (see F2).
- **Clarification:** a role claim inside a properly signed token is **not** unsafe in itself, because only the holder of the secret can create it. The legacy problem is the missing signature check, not the existence of a role claim.
- **Fix implemented:** `requireAuth` sets `req.user` to exactly `{ id, role }` after verifying signature, algorithm, expiry, an integer `sub` (as a string) and a role of `admin` or `agent`. `GET /auth/me` re-reads the user from the database and returns `{id,email,role}` only. Tests cover invalid, zero, fractional and negative subjects, unknown or missing role, a missing subject, and a valid token for a user that no longer exists.
- **Remaining limit:** the role is cached in the token for up to 15 minutes. A demoted or deleted user keeps their old role on `DELETE` until expiry. There is no revocation. Reading the role from the database on each request would remove this at the cost of one lookup.

### F12. Smaller issues (Low, proven)

- The legacy login returns the token in the JSON body, which pushes the client toward `localStorage`, where any XSS can read it. Now it is set only as an httpOnly cookie.
- `sub` was a number. JWT `sub` is a string, so it is now `String(user.id)`.
- Delete answered `{ok:true}` even for a missing order. It now returns 204 or 404.
- Errors were ad-hoc strings (`{error:'no token'}`). All are now `{error:{code,message,details?}}`.

## Token storage answer (README-ready)

**Token storage:** The session token is kept in an httpOnly, SameSite=Strict cookie, so injected JavaScript (XSS) cannot read and steal it, and SameSite stops browsers from sending it on most cross-site requests, which blocks most CSRF. CSRF protection rests on SameSite alone, because there is no CSRF token. The cookie does not stop XSS from acting as the user inside the open session (same-origin requests carry it automatically), and it cannot protect against a privileged browser extension, malware, or a stolen unlocked device.

## Known limits

- The role is cached in the token for up to 15 minutes, and there is no revocation or refresh.
- The login limiter is per process and per IP, as described in F9.
- CSRF defence is SameSite=Strict only. There is no CSRF token and no Origin check.
- No HTTPS enforcement in this code. `cookieSecure` is false for local HTTP and defaults to true in production when the variable is absent.
- No MFA, password policy, password reset or audit log.
- bcrypt uses only the first 72 bytes of a password.

## What the tests cover

`server/test/auth.test.ts` runs against a temporary-file SQLite database. It covers valid login, token claims, case-insensitive email, `/me` shape, identical 401 responses, 400 validation cases, cookie flags (including `Secure`), logout clearing, query and header tokens ignored, twelve rejected-token cases, deleted-user token, the login limiter, and DELETE for 401, 403, 204 with cascade, 404, 400 and ignored non-cookie tokens.

**Not covered by auth tests:** `skipSuccessfulRequests` and dummy-hash timing.
The create tests separately verify real SQLite lock contention maps to 503 and
same-key retry succeeds. Browser tests exercise the same-origin Vite proxy,
but do not model a production reverse-proxy deployment.
