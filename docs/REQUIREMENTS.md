# Assessment requirements map

The original SARH Full Stack Take-Home Test v2 was reviewed in full. Junior scope.

| Requirement | Location / evidence |
|---|---|
| React 18+, Node, real SQLite | Manifests, server/src/db/connection.ts; build/database logs |
| 50k orders, 1–5 items, totals/status/dates | seed.ts; fresh isolated seed and verify-database.ts |
| R1 search/filter/date/amount sort | client/src/orders, server/src/orders/list; list/e2e tests |
| Bounded pages and indexes | list.repository.ts, list.service.ts, schema.sql; README index table |
| Rapid-filter correctness | useOrders.ts, useLatestRequest.ts; reordered responses/debounce/Load-more tests |
| R2 client/server validation | validation.ts, create.schema.ts; boundary/browser tests |
| Server duplicate prevention | create.service.ts + unique user/key; live 2+20 proof, rollback/lock tests |
| Mandatory auth review/fixes | README security table; SECURITY_REVIEW.md; auth tests |
| Admin/agent seeds and admin deletion | seed.ts, README credentials, delete.routes.ts; direct API checks |
| Token answer, 2–3 sentences | README: three sentences covering protection and limits |
| Three decisions, 5–8 lines each | DECISIONS.md: seven lines each, R2/alternatives/reasons included |
| AI disclosure | DECISIONS.md: Claude and Codex, actual assistance and reported effort |
| Product answer, <=5 lines | README: three-line answer; no bulk deletion built |
| Skipped scope | README: O1/O2 omitted; SCALE not applicable to Junior |
| Local setup/no hosted service | README; clean-setup.json with measured scope |
| Environment example/no real secrets | .env.example, .gitignore; deliverable inspection |
| Git link/history | Existing repository; preserve history and verify final remote revision |
| Recording OR three screenshots | SUBMISSION.md evidence index |
| Time budget | Self-reported personal active time under two hours; combined agent runtime not measured |
| Delivery | Junior, m.alharbi@sarh.ai, Thu 22 Oct 2026 EOD; timezone unspecified |

SQLite, Express, keyset pages, UUID keys, USD and 300 ms debounce are implementation
choices. Public registration was removed because anonymous access is inappropriate
for an internal customer-data console. The learning guide is supplementary.
