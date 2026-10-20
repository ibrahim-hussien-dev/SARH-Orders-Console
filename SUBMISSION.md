# Junior assessment submission guide

This guide maps the five-page SARH brief to the actual project. Candidate
understanding and personal decisions cannot be certified by automated checks.

## Every required deliverable and its location

| PDF requirement | Actual location | Evidence / remaining action |
|---|---|---|
| React 18+, Node, real local database | `client/package.json`, `server/package.json`, `server/src/db/connection.ts` | SQLite file; no hosted service |
| 50,000+ orders, 1–5 items, totals/status/dates | `server/src/db/seed.ts`; `npm run seed` | Full verification in `docs/evidence/database-verification.txt` |
| R1 search, status filter, date/amount sort | `client/src/orders/OrderFilters.tsx`, `useOrders.ts`, `server/src/orders/list/` | API tests and real browser scenarios |
| R1 bounded pagination and indexes | `list.repository.ts`, `server/src/db/schema.sql`, README index table | Default 50, maximum 100; EXPLAIN evidence |
| R1 rapid-filter correctness | `useLatestRequest.ts`, `useOrders.ts`, `client/test/useOrders.test.ts`, `e2e/orders.spec.ts` | Controlled reordered successes/errors, Load more, 300 ms debounce |
| R2 validated form and amount | `CreateOrderForm.tsx`, `client/src/validation.ts`, `server/src/orders/create/` | Client/server validation, server integer-cent total |
| R2 server duplicate prevention | `create.service.ts`, `create.hash.ts`, schema composite primary key | Immediate transaction, unique user/key, replay and 422 |
| R2 same request twice in parallel | `server/src/scripts/prove-no-duplicates.ts` | Saved live proof, two parallel calls plus twenty retries, one identity |
| Auth review and fixes | README security table, `docs/SECURITY_REVIEW.md`, `server/src/auth/` | Verified JWT/expiry, bcrypt, validation, rate limits and safe errors |
| Seed admin and agent; server admin deletion | README credentials; seed; `server/src/orders/delete/` | Direct API 401/403/204 checks |
| Token answer in 2–3 sentences | README **Token-storage answer** | Three sentences: storage, protection and limitations |
| Three decisions, 5–8 lines, one R2 | `DECISIONS.md` | Three seven-line decisions, alternatives and reasons; candidate review required |
| AI disclosure | `DECISIONS.md` and README | Earlier AI deliveries and Codex integration/sign-up/testing disclosed |
| Product answer, maximum five lines | README **Product question** | Three-line draft; no bulk-delete implementation |
| What was skipped and why | README **What was skipped and known limits** | O1/O2 omitted, SCALE senior-only |
| Setup, seed, test commands | README **Install and run**, **Checks and production build** | Complete fresh-machine under-five-minute timing not verified |
| Example environment and no real secrets | `.env.example`, `.gitignore` | Never stage `.env`, SQLite files or dependency folders |
| Git link and retained history | Repository below | Existing commit preserved; final changes must be reviewed/committed/pushed |
| Two-minute recording OR three screenshots | Screenshot selection below | Three genuine captures plus execution records available |

The brief does not require Docker, deployment, a component library, pixel-perfect
design, full coverage, or optional O1/O2. SCALE.md applies only to Senior.
Agent sign-up is a later user-requested feature, not an original requirement.

## Selected three screenshots

1. `docs/evidence/01-agent-list.png`: populated R1 agent list and bounded page.
2. `docs/evidence/02-latest-filter.png`: R1 final selection after controlled rapid-filter/load-more reordering.
3. `docs/evidence/04-duplicate-proof.png`: R2 genuine captured parallel-request proof output rendered in a browser.

Keep `race-execution.json`, `e2e-results.json`, `e2e-console.txt` and
`duplicate-proof.txt` alongside the screenshots. A still image does not prove
request-order correctness; the controlled execution and assertions do.
Screenshot 04 is not a native terminal capture; it displays actual CLI output.
`03-safe-replay.png` is optional additional evidence of lost-response recovery.

Alternatively, record two minutes: sign in, show search/filter/sort/Load more,
enable slow simulation and switch filters three times, then show the parallel
duplicate proof and explain the same order identity. Both formats are not required.
Running the duplicate script again adds two synthetic proof orders.

## Candidate confirmations

- Read and defend the three decisions. Replace an alternative you did not
  seriously consider with your actual reasoning; the PDF explicitly assesses this.
- Confirm the product answer reflects your response.
- Confirm actual AI tools and your contributions. Do not invent model names,
  authorship, testing actions or personal decision history.
- On 20 October the candidate reported less than two hours of personal active
  work. That is self-reported, not an independent measurement of combined effort
  across all agent/integration phases. The brief asks for about five hours and
  stopping if past six; do not claim unmeasured cumulative compliance.
- Be ready for the 60-minute live technical conversation and code modifications.

## Repository and final checks

Latest verification passed: typecheck, 142 server/client tests, build, read-only
database verification, and a direct ten-scenario Chrome run with clean exit 0.
See `docs/evidence/final-verification.md` for the earlier shutdown hang and
remaining verification limits. These results do not remove the personal-review
or final remote-access steps below.

Observed configured repository:
`https://github.com/ibrahim-hussien-dev/SARH-Orders-Console`

Final inspection found two commits, `8cde75b` and `a2e1cd6` (sign-up);
remaining documentation/evidence changes are local until reviewed, committed
and pushed. Codex did not create either commit. A configured remote and
local tracking refs do not prove the remote includes those changes or reviewer
access. Preserve history; do not manufacture historical commits.

From the project directory:

```powershell
npm run typecheck
npm test
npm run build
npm run verify:db
npm run test:e2e
git status --short
git diff --check
```

Review the diff, stage only intended source/tests/docs/evidence, inspect staged
files, then make an honest commit. Push after your review and open the remote
as a reviewer would. For a private repository, grant access to the recipient
below. Do not upload `.env`, SQLite data, runtime caches or `node_modules`.

## How to submit

- To: **m.alharbi@sarh.ai**
- Position: **Full Stack Developer (React) — Junior**
- Deadline: **Thursday 22 October 2026, end of day**. No timezone is given; send early.
- Include the repository link and either the three selected screenshots or a
  two-minute recording link. Screenshots can be attachments or accessible repo links.
- Keep **README.md** and **DECISIONS.md** at repository root. These are the exact
  filenames; do not create competing Read.md or Decision.md copies.
- No deployment or PDF export of README is required.

## Email draft — review before sending

Subject: SARH Full Stack Developer (React) — Junior assessment

Hello,

Please find my SARH Orders Console assessment for the Junior position:

Repository: https://github.com/ibrahim-hussien-dev/SARH-Orders-Console

Setup, seed and test commands, security findings, the product answer and
known limitations are in README.md. The three implementation decisions and
AI-use disclosure are in DECISIONS.md.

The three screenshots in docs/evidence (01-agent-list.png,
02-latest-filter.png and 04-duplicate-proof.png) cover R1 and the R2 duplicate
proof. Supporting execution logs and controlled rapid-filter results are
included in the same directory.

Optional O1/O2 and the Senior-only design memo were intentionally omitted.

Thank you.

Before sending, add your name, confirm access and final remote contents,
and include any truthful effort/remaining-limit note you want to disclose.
This is a local draft only. Codex has not sent any message or pushed changes.
