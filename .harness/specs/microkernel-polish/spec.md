# microkernel-polish — Spec (lite)

## Intent

Land Wave 1 of the microkernel platform work plan (`architecture/v3.md` §6.2
deferred guardrails): every `kit regen` umbrella generator gains a runnable
freshness check, the `harness-telemetry` executable contract subtype gets its
static shape check, `Q-NEW-1`/`Q-NEW-3` are ratified as permanently
kernel-owned, and stale `harness-profile` command strings are corrected.

## Requirements

- **REQ-001.** Every generator in the `kit regen` umbrella shall have a
  runnable `check` registered in `contribution-points.json`, and
  `asdd kit regen --check` shall report zero skipped checks.
- **REQ-002.** `asdd kit versions --check`, `asdd learn --check`, and
  `asdd knowledge sync --check` shall be non-mutating freshness checks: they
  write nothing, exit `0` while the generated artifact matches a recomputed
  derivation of its sources, and exit `1` with a stale report otherwise.
- **REQ-003.** `checkExecutableShape` shall validate per-contract export
  shape — `spec-drift-adapter` literal-exports `{id, description, run}` and
  makes no filesystem-write calls (unchanged); `harness-telemetry`
  literal-exports `{id, description, emit}` and fails closed on mutating
  filesystem calls (append-only write discipline).
- **REQ-004.** A consumer manifest declaring `contributes.phases` or
  `contributes.commands` shall fail closed as permanently kernel-owned
  (`KIT_INTERNAL`), pinned by tests.
- **REQ-005.** `generators["harness-profile"].run` and
  `contribution_points.profiling_rollup.merge.regen` shall read
  `asdd profile --slice <id>`.
