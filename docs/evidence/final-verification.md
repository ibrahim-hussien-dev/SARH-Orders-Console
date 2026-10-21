# Final verification — 21 October 2026

The submitted source has no public sign-up. These are executed checks, not
results inherited from an earlier version. Logs include actual EXIT_CODE lines.

| Command / check | Observed result |
|---|---|
| npm run typecheck | PASS, exit 0 |
| npm test | PASS, 130 server + 6 client tests, exit 0 |
| npm run build | PASS, API/schema and Vite production bundle, exit 0 |
| npm run test:e2e | PASS, nine Chrome scenarios in 39.1 seconds, exit 0; matching console/JSON |
| npm run prove:duplicates | PASS, real login/cookie, two parallel requests + twenty retries; one ID, changed body 422; exit 0 |
| npm run verify:db | PASS, final development data checked read-only; see timestamp/counts in the log |
| Isolated install/setup/seed | PASS, npm ci + setup + 50k seed in 54.99 seconds |
| Isolated runtime readiness | PASS, another 3.394 seconds; UI/API 200, proxy login 200, five authenticated rows |
| Live recording | Race and parallel-create assertions passed; 120-second WebM decoded/seeks checked in Chrome |
| Public sign-up regression | POST /api/auth/signup returns 404 and adds no user |

## Scope

Node 24.14.0, npm 11.9.0, Windows and installed Google Chrome. The clean setup
used a real local Git clone with reviewed uncommitted source changes overlaid,
new dependencies and new database, using this machine's existing dependency cache.
Combined install/seed/start command time was 58.39 seconds, excluding human pauses
and Node installation. It is not a test on a fresh operating system. Alternate
ports 4101/5176 preserved the user's running development services.

The final browser log and JSON describe the same completed run. Earlier attempts
occasionally hung during Windows browser shutdown and were not counted as passes.
The recording's assertions completed and its video finalized, but its process
also hung at browser cleanup; only that process was stopped. The preserved video
was trimmed at the end to 120 seconds, then decoded/seeks checked independently.
No content was fabricated. The video is automated with captions, not narrated
by the applicant, and the live proof image is not a terminal screenshot.

The duplicate CLI proof adds two synthetic orders; the recording adds one.
Existing data was not reset or reseeded. Browser tests use isolated temporary DBs.
Screenshots alone do not prove races; execution assertions and observed IDs do.
The one-process proof is not a distributed concurrency or production load benchmark.

The separate dependency audit JSON is a dated historical artifact, not a new
security audit. The clean installation itself reported zero known vulnerabilities
at install time. No production deployment or email submission is implied.
