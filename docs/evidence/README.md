# Verification evidence

Final verification: 21 October 2026, Node 24.14.0, npm 11.9.0.

| Artifact | What it establishes |
|---|---|
| typecheck.txt | Server/client/tooling checks, exit 0 |
| unit-tests.txt | 130 server + 6 client tests, exit 0 |
| build.txt | Compiled API/schema and client, exit 0 |
| e2e-console.txt and e2e-results.json | Same final nine-scenario Chrome run, 39.1 seconds, clean exit 0 |
| duplicate-proof.txt | Real login/cookie, two parallel creates, twenty retries, one identity, changed-body rejection |
| database-verification.txt | Read-only counts/totals/dates/integrity and query plans |
| clean-setup.json | Isolated local Git clone, locked install, seed and authenticated readiness |
| race-execution.json | Controlled response release and latest IDs checked against API |
| browser-diagnostics.json | Observed errors and intentional aborted/failed requests |

See [final-verification.md](final-verification.md) for scope and limitations,
and [SUBMISSION.md](../../SUBMISSION.md) for selected visual evidence.
Screenshots cannot independently prove races; assertions and controlled response
release provide that evidence. The recording is automated, not personal narration.
Earlier browser shutdown hangs were not counted as passes. Final logs above
match the successful completed run. The duplicate script adds two synthetic
orders each time and proves one-process HTTP behavior, not distributed load.

Setup was measured on this machine with an existing dependency cache, using a
local clone with reviewed working source overlaid. It excludes human pauses
and Node installation, and is not a fresh-operating-system benchmark.
