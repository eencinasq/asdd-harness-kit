# Lessons: jev-module

Second slice of the kit developed with the kit (full mode, 2026-10-28). Kept in the slice directory (kit-only).

## Outcome

- Jev is an optional module: a default install has no Jev scripts, MCP entry, steering, or config; `--modules=jev` (or `all`) restores today's behavior; upgrades keep an existing Jev install; `--remove-modules=jev` drops it for good.
- `shape-up` and `product-delivery` stay in the core (Tech Lead decision) with one set of gate criteria: Jev decides with the module, a human (`decided_by`) without it.
- The core no longer imports Jev; the dead validator is gone.
- Always-loaded steering on an installed project: 34,331 → 31,962 bytes.
- 14 requirements; 6 features passing; QA passed with a `QG-SPEC-08` warning acknowledged by the Tech Lead.

## What the harness caught

| Caught by | What | Follow-up |
|---|---|---|
| Validation (reading the installer) | Every pre-module project would get Jev forever (VAL-001) | REQ-014 `--remove-modules=jev` |
| A real module install | The kit's own failure log (with kit slice history) was seeded into every project; a fresh project warned about the kit's patterns | Fixed: logs seed from `scripts/templates/docs/`, excluded from npm |
| Hand-counted QA | REQ-006 and REQ-008 had no test (DRIFT-04 would have passed them) | Tests added (TASK-001 reopened) |
| DRIFT-02 | Five times, edits to shared files reopened features of the DONE kit-hygiene slice and blocked `passing` here | **SP-003** (DRIFT-02 only for open slices) |
| DRIFT-05 | Deleting a file listed in `scope_paths` fails the feature (third time across slices) | Candidate: let a feature declare removed paths |

## What worked

- **One owning task per file (SP-002) applied in planning:** no DRIFT-02 *inside* this slice. All remaining DRIFT-02 came from the other, finished slice — which is what SP-003 addresses.
- **Tests first in their own task:** the default-install assertions went red for the right reason and turned green as each task landed.

## Patterns below threshold (watch)

- `blocked:phase:validation` ×2 and `blocked:phase:qa` ×2: both slices blocked once at Validation (spec gap found by reading code) and once at QA (a MUST with no test). One more occurrence opens a pattern. A likely guide change: Task Planning maps every MUST requirement to a named test before Implementation.
- `failure:distribution:kit-log-seeded-into-projects` ×1.

## Process notes

- Two features were briefly marked `passing` before `check-invariants` exited 0 (the cross-slice DRIFT-02 was resolved right after). The rule is clear; the order of operations slipped.

## Proposals

- SP-001 (E1 → choose full upfront): `proposed`; evidence inflated by the learning-lib defect (escalation counted for full slices).
- SP-002 (one owning task per file): `proposed`; applied informally here and it worked.
- SP-003 (DRIFT-02 only for open slices): `proposed`, from LP-b5774134 (×5).
