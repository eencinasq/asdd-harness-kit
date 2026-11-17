# amend-close — Spec (hotfix)

## Intent

After `asdd slice amend`, a slice never returns to `DONE`: the amend writes a checkpoint with `status: in_progress`,
and `deriveStatus` lets the latest status checkpoint win, so completing knowledge again changes nothing. Every amend
this cycle needed a hand-written `status: DONE` checkpoint. An `in_progress` checkpoint (resume or amend) should hold
only until a later `phase_completed` for `knowledge`; PARKED and ABANDONED keep holding until a later checkpoint.

Mapped: `cli/src/harness/sync-state.mjs`, `cli/src/harness/amend-slice.test.mjs`, `tools/jev-gate/src/harness/sync-state.mjs`, `tools/knowledge/src/harness/sync-state.mjs`, `tools/spec-drift/src/harness/sync-state.mjs` (vendored copies, `asdd kit vendor`)

## Requirements

- **REQ-001.** WHEN a `phase_completed` for `knowledge` comes after the latest `in_progress` checkpoint and no feature is active, `deriveStatus` shall return `DONE`.
- **REQ-002.** An `in_progress` checkpoint with no later knowledge completion shall keep the slice `in_progress`; PARKED and ABANDONED shall hold as before.
