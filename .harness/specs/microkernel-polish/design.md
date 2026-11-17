# microkernel-polish — Design (lite)

## Changes

- `cli/src/kit/versions.mjs` — parameterize the kit root (`KIT` default) so
  `collectArtifacts`/`checkVersions` are fixture-testable; add `--check`:
  recompute `collectArtifacts()` + kit version, diff the artifacts map of
  `cli/versions.json` and `.harness/config/versions.json` against it, and
  sha256-compare the two files (the self-installed copy must be identical).
- `cli/src/harness/learn.mjs` — `--check` short-circuits before the mutating
  pipeline (`ingestReviewMetrics`/`compactSignals`/`writePatterns`):
  `derivePatterns(root)` vs on-disk `patterns.json` (patterns +
  `unsigned_failures`), exit 1 on drift/missing.
- `cli/src/harness/sync-knowledge.mjs` — `--check` in `main()` before
  `writeKnowledgeIndex`: `scanKnowledge(root)` vs the three JSONL files;
  chunks compared with `embedding` stripped (carried vectors are not part of
  freshness).
- `cli/src/install/registry.mjs` — `checkExecutableShape` consults a
  contract-shape table: `spec-drift-adapter` → `{id, description, run}` +
  read-only lint (current behavior); `harness-telemetry` →
  `{id, description, emit}` + append-only lint (mutating fs calls —
  `writeFileSync`, `mkdirSync`, `rmSync`, `createWriteStream`, `truncate`,
  `unlink`, `rename`, `copyFile` — fail closed; `appendFileSync`/`appendFile`
  permitted as the O_APPEND contract surface).
- `cli/registry/contribution-points.json` — `generators.{build,versions,
  learn,sync-knowledge}.check` runnable strings; `harness-profile.run` +
  `profiling_rollup.merge.regen` → `asdd profile --slice <id>`;
  `adapter.schema` text documents both contract subtypes; `learn` and
  `knowledge.sync` help strings gain `[--check]`.
- `cli/src/main.mjs` — `kit versions` help line gains `[--check]`.
- `cli/test/registry.test.mjs` — telemetry shape acceptance/rejection,
  `contributes.phases` fail-closed (Q-NEW-1), umbrella generators all carry
  runnable checks (REQ-001).
- `cli/test/versions.test.mjs` — new: `checkVersions` fixture coverage
  (missing, fresh, stale, stale installed copy).

## Domain terms

None new. `harness-telemetry` contract subtype is already ratified
(`architecture/v3.md` §2.2-addendum).

## Decision (Q-NEW-1 / Q-NEW-3 ratified)

`commands` and `phases` remain **permanently kernel-owned**: a consumer
phase binds gates, owning agents, and steering-tag allocation — a contract
change, not a manifest row; a consumer command needs a dispatcher entry in
the kernel's table — an execution surface the closed microkernel does not
open. Executable contributions (adapters/mcp/hooks with contract subtypes)
are the extension point.
