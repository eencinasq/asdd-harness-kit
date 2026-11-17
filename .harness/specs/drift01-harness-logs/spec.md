# drift01-harness-logs — Spec (hotfix)

## Intent

Apply steering proposal SP-006 (accepted by the Tech Lead, 2026-11-16): `docs/agent-failure-log.md` and
`docs/dissent-log.md` are append-only harness records that any slice must write (session close, dissent), so DRIFT-01
must not charge them to the editing slice. Add both to `EXEMPT_PREFIXES`, the list DRIFT-01 already uses for
`.harness/state/**` and the other harness records. Every other file under `docs/` stays subject to mapping (SP-004).

Mapped: `cli/src/harness/drift-lib.mjs`, `cli/src/harness/drift-lib.test.mjs`, `cli/steering/spec-drift.md` (source), `.harness/steering/spec-drift.md` (copy, `asdd kit self`), `tools/knowledge/src/harness/drift-lib.mjs`, `tools/spec-drift/src/harness/drift-lib.mjs`, `tools/jev-gate/src/harness/drift-lib.mjs` (vendored copies, `asdd kit vendor`), `docs/knowledge-base/steering-proposals/SP-006.md`

## Requirements

- **REQ-001.** DRIFT-01 shall not report `docs/agent-failure-log.md` or `docs/dissent-log.md` when they change.
- **REQ-002.** DRIFT-01 shall keep reporting any other unmapped changed file under `docs/`.
