# asdd-p0 — Requirements

Backfilled from `spec.md` after lite → escalated (E1).

- **REQ-001 (MUST).** `asdd status --metrics` shall print pipeline metrics derived from harness state (lite share among DONE slices, escalation rate, median phase durations from sessions, stop-FAIL signal counts from learning summaries, open learning patterns), and `--json` shall emit the same object on stdout.
- **REQ-002 (MUST).** The kit shall ship deterministic unit tests (synthetic session/summary fixtures) that lock the metrics formulas for: a green lite DONE slice, DRIFT-style stop FAILs, and an escalated lite slice.
- **REQ-003 (MUST).** `asdd init-flow [dir]` shall, non-interactively with defaults: ensure the harness is installed in `dir` (or cwd), create one lite slice, write a minimal `spec.md` / `tasks.md` / one feature with `scope_paths`, fill the minimum binding slots so `asdd check` can exit 0, run `asdd check`, and print next steps. It shall not publish to npm.
- **REQ-004 (MUST).** The repository shall hold a one-page guide `cli/docs/guides/spec-kit-to-asdd.md` mapping Spec Kit concepts (constitution, specify, plan, tasks, implement, converge) to ASDD + Harness (steering, intent/spec, design, tasks/features, implementation, DRIFT + QA).
