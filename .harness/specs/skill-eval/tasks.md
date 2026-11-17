# skill-eval — Tasks

Single wave, serial (lite).

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 skill-eval lib: fixture discovery, sandboxed probes, deterministic assertions, per-skill pass rate | REQ-001, REQ-002 | `cli/src/harness/skill-eval-lib.mjs`, `cli/src/harness/skill-eval-lib.test.mjs` |
| TASK-002 CLI entry + `--baseline` delta + command registration | REQ-001, REQ-003, REQ-004 | `cli/src/harness/skill-eval.mjs`, `cli/src/harness/skill-eval-lib.mjs`, `cli/src/harness/skill-eval-lib.test.mjs`, `cli/src/harness/commands.mjs`, `package.json` |
| TASK-003 Real fixtures for asdd-status, asdd-next, codegraph + README row + versions regen | REQ-001, REQ-002 | `cli/eval/skills/**`, `README.md`, `cli/versions.json` |

Harness records (learning loop, not product scope): `docs/knowledge-base/steering-proposals/SP-006.md` — proposal for pattern LP-06528643 required by QG-LEARN-04 before this slice can pass `asdd check`.
