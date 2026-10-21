# Submission evidence

Repository: https://github.com/ibrahim-hussien-dev/SARH-Orders-Console

- [README](README.md): setup, seed/test commands, security review, product answer and skipped scope.
- [DECISIONS](DECISIONS.md): three design decisions, alternatives, limits and AI disclosure.
- [Requirements map](docs/REQUIREMENTS.md): every mandatory Junior requirement and its implementation.
- [Code guide](docs/CODE_GUIDE.md): beginner-oriented concepts, file map and modification recipes.
- [Two-minute demonstration](docs/evidence/demo.webm): real automated browser actions, rapid-filter race and two parallel create requests. Captions explain the actions; this is not personal narration.
- [Demo execution](docs/evidence/demo-execution.json): observed response order, equal order identities and one matching row.
- [Verification summary](docs/evidence/final-verification.md): current commands, exit codes and scope.
- [CLI duplicate proof](docs/evidence/duplicate-proof.txt): authenticated two-request and twenty-retry verification.

Supporting screenshots: 01-agent-list.png (browser suite), 02-latest-filter.png
(recorded latest selection), 03-safe-replay.png (browser retry), and
04-live-duplicate-proof.png (actual parallel API result shown over the live UI).
They are in docs/evidence. None is presented as a native terminal screenshot.

The primary visual submission is the recording; logs and assertions substantiate
its race and duplicate checks. O1/O2 and Senior-only SCALE.md are intentionally
excluded from this Junior assessment.
