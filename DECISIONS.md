# Implementation decisions

## 1. Persist idempotency with the order

I use a UUID idempotency key scoped to the authenticated user to identify one create attempt.
One immediate SQLite transaction stores the order, its items and the unique user/key record.
A hash of the normalized body lets retries return the same order; changed-body reuse returns 422.
An in-memory key map would be simpler, but it loses the record after restart, so I use database persistence.
The client keeps the original body/key after an uncertain failure and retries that same attempt.
The parallel-request proof verifies one order through a single running Node process, not a distributed system.
Different keys can create similar orders; deleting an order removes its key, and keys otherwise do not expire.

## 2. Use keyset pagination and reject obsolete responses

I use bounded pages ordered by creation date or total, with ID as the unique tiebreaker.
The query reads one extra row to detect another page; composite indexes support status and sorting.
Offset pagination is easier for numbered pages, but deep offsets scan skipped rows and shift during inserts.
Keyset pagination fits the Load more interface and avoids sending 50,000 orders to the browser.
AbortController saves unnecessary work, while a generation check prevents stale success, error or loading updates.
Search waits 300 ms; old requests become invalid immediately, including during debounce and Load more.
Contains search can still scan, loaded rows accumulate in the DOM, and pages are not a live database snapshot.

## 3. Keep authentication in a short-lived HttpOnly cookie

I use bcrypt password hashes and a verified HS256 JWT with a 15-minute expiry.
The browser receives the token only as an HttpOnly, SameSite=Strict cookie; the API enforces admin deletion.
A localStorage bearer token makes explicit request headers convenient, but injected JavaScript can steal it directly.
The cookie reduces that exposure, although XSS can still make requests as the signed-in user.
SameSite limits cross-site requests; there is no separate CSRF token, refresh flow or token revocation.
Roles are cached until expiry, so demotion or user deletion does not immediately invalidate every order request.
I keep account access seeded and remove public registration because this console exposes customer information.

## AI-use disclosure

I used Claude and Codex for this assessment. Claude assisted with the initial
implementation deliveries, review and checking the project against the brief.
Codex integrated the deliveries, repaired issues, ran the automated checks,
and helped write the documentation and code-learning guide. A public sign-up
feature was added during development and then removed after the security review.
The decisions above describe the final design and its tradeoffs; AI assistance
contributed to both the implementation and this explanation. I do not claim
that I independently authored every line or manually performed the automated tests.

My personal active time coordinating the AI-assisted work was under two hours,
as reported on 21 October 2026. This is not a measurement of total agent runtime.
