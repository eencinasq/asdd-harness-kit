# Lessons: kit-hygiene

First slice of the kit developed with the kit (full mode, 2026-10-28). Kept in the slice directory (kit-only) rather than `docs/knowledge-base/slices/`, so it never reaches the npm package.

## Outcome

- All 13 requirements met; 8 features passing; `npm test` 130/130; QA passed with a `QG-SPEC-08` warning acknowledged by the Tech Lead.
- Always-loaded steering: 36,627 → 34,331 bytes on an installed project with modules (33,922 in the kit), now capped by a test.
- New sensors: stale mechanisms, agent cutoffs, context budget, bare `!` assertions — all run on the installed project, where shipped guidance actually lands.

## What the harness caught (and the agent missed)

| Caught by | What | Follow-up |
|---|---|---|
| Validation (reading the installer) | REQ-008 left upgrade behavior undefined (VAL-001) | Fixed in spec before design |
| Installing for real | The Domain phase's kit model leaked into installs; `npm test` stayed green because `! cmd` is ignored by `set -e` | Fixed (TASK-001, TASK-006) |
| DRIFT-02 | Six re-verifications: serial tasks shared files | **SP-002** (task-planning guide) |
| DRIFT-05 | Deleting or moving a file listed in `scope_paths` fails the feature | Candidate: let a feature declare removed paths |
| Hand-counted QA | DRIFT-04 passed REQ-006/013 through REQ-id collisions with older tests (OBS-001); priorities ignored (OBS-002) | Candidate drift slice |
| Implementation agent prompt | Mandatory `open-code-review` skipped for TASK-001/002 | Late review done; CR-001 fixed |
| Branch check | Commits landed on a branch switched outside the session | Check the branch before every commit |

## What did not catch anything

Every confidence score in this slice was self-assessed and every one passed its gate. All real blockers came from deterministic checks or from reading code and counting tests. That supports the review that started this slice: the scores record judgment, the sensors carry the weight.

## Defects found in the kit (not fixed here)

1. `learning-lib.mjs` counts lite escalation signals for full slices (this slice raised `escalation:E1-scope-spread` to ×4).
2. The learning loop only sees recorded runs (`--live`/`--record`); most mid-task `check-invariants` runs leave no signal.
3. `docs/agent-failure-log.md` is not exempt from drift like other harness records; listing it in a feature's `scope_paths` makes every log entry reopen that feature.
4. DRIFT-04 / requirement parser: OBS-001 and OBS-002 above.

## Proposals

- SP-001 (E1 → choose full upfront): still `proposed`; evidence inflated by defect 1.
- SP-002 (one owning task per file): `proposed`, from LP-0e072262 (×6).
