# drift02-open-slices — Spec (hotfix)

## Intent

Apply steering proposal SP-003 (accepted by the Tech Lead, 2026-11-16): DRIFT-02 reopens `passing` features only for
slices whose status is `in_progress`. Features of `DONE`, `PARKED`, and `ABANDONED` slices hold historical evidence;
a later slice editing a shared file (`commands.mjs`, `package.json`, `README.md`) reopened up to 18 of them per merge
without finding a defect. Amending a DONE slice makes it `in_progress` again, so its stale features reopen then.
DRIFT-05 (missing scope paths) keeps checking every slice.

Mapped: `cli/src/harness/drift-lib.mjs`, `cli/src/harness/drift-lib.test.mjs`, `cli/test/lifecycle.sh` (its DRIFT-02 e2e case now covers DONE vs amended), `cli/steering/spec-drift.md` (source), `.harness/steering/spec-drift.md` (copy, `asdd kit self`), `tools/knowledge/src/harness/drift-lib.mjs`, `tools/spec-drift/src/harness/drift-lib.mjs`, `tools/jev-gate/src/harness/drift-lib.mjs` (vendored copies, `asdd kit vendor`), `docs/knowledge-base/steering-proposals/SP-003.md`

## Requirements

- **REQ-001.** DRIFT-02 shall compare `evidence_hash` only for `passing` features of slices whose status is `in_progress`.
- **REQ-002.** DRIFT-05 shall keep reporting missing scope paths for `passing` features of every slice.
