# microkernel-polish — Intent

Land Wave 1 of the microkernel platform work plan
(`asdd-harness-kit/@work.plan.md`, `architecture/v3.md` §6.2 deferred
guardrails). Exit gate: every generator in the `kit regen` umbrella has a
registered runnable check and `asdd kit regen --check` reports none skipped.

- `cli/src/kit/versions.mjs` — `--check` mode: verify `cli/versions.json` and
  `.harness/config/versions.json` against the recomputed artifact set and
  digests (non-mutating).
- `cli/src/harness/learn.mjs` — `--check` mode: compare `patterns.json` to a
  fresh `derivePatterns` run without compacting or writing (non-mutating).
- `cli/src/harness/sync-knowledge.mjs` — `--check` mode: compare the on-disk
  nodes/edges/chunks JSONL to a fresh `scanKnowledge` run (non-mutating).
- `cli/registry/contribution-points.json` — runnable `check` strings for
  `build` (`asdd kit build --check`), `versions`, `learn`, `sync-knowledge`;
  `generators.harness-profile.run` and
  `contribution_points.profiling_rollup.merge.regen` corrected to
  `asdd profile --slice <id>`; adapter schema text documents the
  `harness-telemetry` contract subtype.
- `cli/src/install/registry.mjs` — `checkExecutableShape` validates
  per-contract export shape: `spec-drift-adapter` stays
  `{id, description, run}` read-only; `harness-telemetry` requires an `emit`
  member and append-only write discipline. Static shape only; runtime
  never-throw/never-exit semantics belong to Phase-2 executable tests.
- `cli/test/` — tests pinning the above (registry shape tests, generator
  check coverage, `contributes.phases` fail-closed for the Q-NEW-1
  ratification).

Q-NEW-1 / Q-NEW-3 resolution (recorded here and in sessions):
`commands` and `phases` remain **permanently kernel-owned** (`KIT_INTERNAL`
in `registry.mjs`). A consumer phase binds gates, owning agents, and
steering-tag allocation — deeper than artifact mounting and a contract
change, not a manifest row. A consumer command needs a dispatcher entry in
the kernel's own table — an execution surface the closed microkernel does
not open. Registered executable contribution types (adapters/mcp/hooks)
with contract subtypes are the extension point. Revisit only via a new
proposal carrying a concrete consumer case.

Scope guard: `cli/` only (source, registry, tests). No vault docs, no
`.harness/` product state, no telemetry emitter — Phase 2 is Wave 3.
