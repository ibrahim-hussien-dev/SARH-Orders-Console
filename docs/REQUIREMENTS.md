# Original brief reconciliation

Source: `C:\Users\Precision 5550\Downloads\SARH_FullStack_Take-Home_Test_v2.pdf`,
five pages, read on 20 October 2026. Text extracted with pypdf; pages 2–3 also
rendered and visually inspected. The source was not modified.

| Employer requirement | Implemented / evidence |
|---|---|
| React 18+, Node, real local DB | React 18.3.1, Node 24.14.0 / Express, file-backed SQLite |
| At least 50,000 orders, 1–5 items | Seed 50,000 / 149,622; read-only verify script checks every total and item count |
| Name/email search, status filter, date/amount sort | Parameterized list API and UI; 40 list tests and browser checks |
| Bounded pagination, no whole table in browser, indexes mentioned | 50-row keyset pages (max 100), README index table, actual EXPLAIN output |
| Rapid filter changes must not show earlier slower results | Abort + generation gate, immediate invalidation, hook tests, controlled browser response reordering |
| Create form with client/server validation | Shared limits by contract; browser validation and 44 create tests |
| Server duplicate guarantee and twice-in-parallel proof | IMMEDIATE transaction + unique user/key, live 2 + 20 HTTP proof, browser lost-response and timeout retries |
| Review/fix auth snippet; admin + agent seeds | 42 auth tests, integrated cookie test, security findings and 3-sentence token answer in README |
| Three decisions, each 5–8 lines, one covering R2, AI disclosure | DECISIONS.md; explicitly requires candidate confirmation of their own understanding |
| Product answer <=5 lines | Candidate-supplied three-line draft in README; personal review flagged |
| Optional O1 or O2 at most one | Both skipped explicitly; no penalty according to brief |
| SCALE.md for seniors | Omitted for Junior scope |
| Local setup under five minutes, no paid/hosted service | Observed install about one minute, seed 3.445 seconds; local-only runtime; machine/network variability remains |
| .env.example, no real secrets committed | Random local secret, empty example, git-ignore checks |
| Git link and history | Existing repository had no commits. No fabricated history, push or publication; candidate submission task remains |
| Two-minute recording or three screenshots for R1/R2 | Genuine screenshots + execution evidence saved; candidate chooses/submits evidence |
| ~5-hour effort, stop if past six hours | Session start recorded; prior candidate active hours unknown and requested, no cumulative-hours claim |
| Deadline Thu 22 Oct 2026 EOD | Verified page 5; email m.alharbi@sarh.ai; timezone not specified; no submission performed |

## Engineering choices, not employer mandates

The contract supplies SQLite, Express 4, npm workspaces, the exact API schema,
USD, UUID keys, cookie/JWT details, keyset pagination, and 300 ms debounce.
The employer allows other real databases/frameworks and server-side pagination.
Retaining those compatible delivered choices avoided an unnecessary rewrite.
The old Node 20 pin was changed to the installed Node 24 with compatible SQLite
and security-patched tooling. No employer requirement pins Node 20.

The security review deliberately qualifies plaintext-storage and ORM injection
claims: the PDF does not reveal the data layer's implementation. Signed role
claims are not inherently unsafe; unverified payloads are. Cached role changes,
SameSite-only CSRF protection and no revocation are disclosed implementation limits.
