# Implementation decisions

These are three decisions embodied in the integrated implementation, each
written in seven lines as requested by the brief. The alternatives below are
technical comparisons, not evidence that the candidate personally considered
them. **Candidate confirmation required:** review and defend each tradeoff;
if an alternative was not one you seriously considered, replace it with your
actual alternative and reasoning before submission.

## 1. Persist idempotency with the order

One immediate SQLite transaction stores the order, items and `(user_id, key)`.
The normalized body hash makes exact retries replay and changed-body reuse return 422.
A unique database key backs the guarantee; a disabled button alone cannot cover network retries.
Alternative: an in-memory key map is simpler, but loses the guarantee after restart, so persistent keys fit this requirement.
The browser retains the same body/key for ambiguous failures, reload and same-user reauthentication.
The live proof establishes one-process HTTP behavior, not a multi-process concurrency benchmark.
Different keys, edits after uncertain failure, explicit logout or order deletion can permit another order; keys never expire.

## 2. Use keyset pages and invalidate obsolete requests

List queries fetch at most 101 rows, ordered by date or total plus the id tiebreaker.
Composite status/sort indexes support both directions; item counts use the item-order index.
Alternative: offset pagination simplifies numbered pages, but deep pages scan skipped rows and shift during inserts.
Keyset pages fit Load more; fetching the entire table would put 50,000 orders in browser memory and violate the brief.
AbortController plus a request generation rejects stale success, error and loading updates, including Load more.
Invalidation begins before paint; a 300 ms search debounce remains active through filter changes.
Contains search still scans; token FTS would change semantics, and repeated Load more can still grow the DOM.

## 3. Keep a short-lived session in an HttpOnly cookie

Login verifies bcrypt hashes and issues a signed HS256 JWT with a 15-minute expiry.
The API accepts only its HttpOnly, SameSite=Strict cookie and enforces admin deletion itself.
Alternative: localStorage bearer tokens simplify explicit API headers, but injected JavaScript could directly steal them.
The cookie approach limits direct token theft while retaining the delivered JWT design and a small local implementation.
SameSite mitigates most CSRF; it does not stop XSS acting within the session or every same-site threat.
Role changes, deletion of users and stolen tokens may remain effective until expiry; logout clears the browser cookie only.
No refresh, revocation, CSRF token or distributed rate limiter was added; these limits are explicit in README.

## AI-use disclosure

The candidate supplied multiple earlier AI deliveries. Codex integrated their
code, reviewed the actual files, fixed request lifecycle issues, installed and
updated dependencies, added integration/browser tests, and produced documentation
and execution evidence. Codex subsequently added Agent sign-up at the user's
request and tested it against isolated databases. Original deliveries said NOT RUN; only locally observed
results are reported as verified.

**Candidate confirmation required:** add the actual tool/model names and your
own contributions only if you can substantiate them. Do not claim you personally
performed Codex's checks or that this document proves your understanding.
