# Implementation decisions

These describe the integrated implementation. They are not personal claims by
the candidate. **Candidate confirmation required:** review each tradeoff and
replace or qualify any statement that does not reflect your understanding.

## 1. Persist idempotency with the order

One immediate SQLite transaction stores the order, items and `(user_id, key)`.
The normalized body hash makes exact retries replay and changed-body reuse return 422.
A unique database key backs the guarantee; disabling a button alone was rejected because network retries bypass it.
An in-memory key map was rejected because restart would lose the record.
The browser retains the same body/key for ambiguous failures, reload and same-user reauthentication.
The live proof establishes one-process HTTP behavior, not a multi-process concurrency benchmark.
Different keys, edits after uncertain failure, explicit logout or order deletion can permit another order; keys never expire.

## 2. Use keyset pages and invalidate obsolete requests

List queries fetch at most 101 rows, ordered by date or total plus the id tiebreaker.
Composite status/sort indexes support both directions; item counts use the item-order index.
Offset pagination was rejected because deep pages scan skipped rows and shift during inserts.
Fetching the entire table was rejected because 50,000 orders do not belong in browser memory at once.
AbortController plus a request generation rejects stale success, error and loading updates, including Load more.
Invalidation begins before paint; a 300 ms search debounce remains active through filter changes.
Contains search still scans; token FTS would change semantics, and repeated Load more can still grow the DOM.

## 3. Keep a short-lived session in an HttpOnly cookie

Login verifies bcrypt hashes and issues a signed HS256 JWT with a 15-minute expiry.
The API accepts only its HttpOnly, SameSite=Strict cookie and enforces admin deletion itself.
LocalStorage bearer tokens were rejected because any injected JavaScript could directly read them.
A server session store was rejected for this assessment to keep the supplied implementation focused.
SameSite mitigates most CSRF; it does not stop XSS acting within the session or every same-site threat.
Role changes, deletion of users and stolen tokens may remain effective until expiry; logout clears the browser cookie only.
No refresh, revocation, CSRF token or distributed rate limiter was added; these limits are explicit in README.

## AI-use disclosure

The candidate supplied multiple earlier AI deliveries. Codex integrated their
code, reviewed the actual files, fixed request lifecycle issues, installed and
updated dependencies, added integration/browser tests, and produced documentation
and execution evidence. Original deliveries said NOT RUN; only locally observed
results are reported as verified.

**Candidate confirmation required:** add the actual tool/model names and your
own contributions only if you can substantiate them. Do not claim you personally
performed Codex's checks or that this document proves your understanding.
