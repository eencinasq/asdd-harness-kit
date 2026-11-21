# microkernel-polish — Tasks

> Planned during Task Planning phase.

Wave 1 — Microkernel Hardening & Deferred Phase-2 Guardrails (work plan).

- [ ] **TASK-001** Runnable `--check` coverage across all 9 `kit regen`
  generators: implement `--check` in `versions.mjs`, `learn.mjs`,
  `sync-knowledge.mjs` (all non-mutating freshness comparisons); register
  runnable check strings for `build`, `versions`, `learn`, `sync-knowledge`
  in `contribution-points.json`. Exit gate: `asdd kit regen --check` runs
  every check and reports zero skipped.
- [ ] **TASK-002** `harness-telemetry` executable shape check (`D-7`/`D-11`):
  `checkExecutableShape` validates per-contract export shape —
  `spec-drift-adapter` `{id, description, run}` read-only (unchanged),
  `harness-telemetry` `{id, description, emit}` with append-only write
  discipline. Registry `adapter.schema` text documents both subtypes.
- [ ] **TASK-003** Ratify `Q-NEW-1`/`Q-NEW-3`: `phases` and `commands` stay
  permanently kernel-owned (`KIT_INTERNAL`). Pin `contributes.phases`
  fail-closed in tests (`commands` already covered); record the resolution
  in intent.md and the slice session.
- [ ] **TASK-004** Stale generator command strings: `generators["harness-profile"].run`
  and `contribution_points.profiling_rollup.merge.regen` →
  `asdd profile --slice <id>`.
