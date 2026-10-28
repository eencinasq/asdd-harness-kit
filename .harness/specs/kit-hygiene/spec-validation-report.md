# Spec Validation Report: kit-hygiene

## Gate Decision
PASSED

> Re-validation (2026-10-28) after the spec revision. The first run was BLOCKED by VAL-001; history below.

## Summary
Validated the 13 requirements of `requirements.md` against the intent (MH-01 … MH-06), the capability audit, and the current code paths (`sync-state.mjs`, `init-slice.mjs`, `scripts/install-into.sh` hook merge, `jev-gate-server.mjs`). One MUST requirement leaves upgrade behavior undefined for existing projects, which is the main risk the intent names.

## Findings

### BLOCKED
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| VAL-001 | REQ-008 | **Resolved** — REQ-008 now has an upgrade rule (rewrite the old entry, never add a second) and AC-006 tests it. Original finding: REQ-008 said hook configs "shall reference" `command-gate.mjs`, but hook configs in existing projects are project-owned and only merged by the installer (`install-into.sh` lines 927–980). The merge detects the gate with `includes('jev-command-gate.mjs')`; after a rename, a check for `command-gate.mjs` also matches the old name (substring), so an upgraded project keeps calling the shim forever and the shim can never be retired. The requirement must state what the installer does to an existing entry. | RESOLVED |

### WARN
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| — | — | none | — |

### INFO
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| VAL-002 | REQ-005 | `PROGRESS.md` is seeded as project-owned (`create`); regenerating it overwrites hand edits. Acceptable: `session-loop.md` already calls it "index only", and drift exempts it. Document it in `session-loop.md`. | INFO |
| VAL-003 | REQ-010 | The budget binding lives only in the kit's `quality-gates.project.md`; projects never run the budget test (kit tests are not installed). Consistent with the intent: the budget protects what the kit ships. | INFO |
| VAL-004 | REQ-006 | Skills keep scoring bands (`anti-pattern-detection` 0.70/0.85) that mirror `QG-DIS-02/03`. Out of scope by the intent's no-go; record as a follow-up candidate. | INFO |

## Anti-Pattern Score
1.00 — from `anti-pattern-detection` skill (no new violations)

## Uncertainty Factors
- Hook merge for Cursor and Claude only: other runtimes have no hook configs, so REQ-009 covers them by the shim alone.

## Recommendation
PROCEED — no BLOCKING or HIGH finding remains (QG-VAL-04, QG-VAL-05). INFO items VAL-002 … VAL-004 carry into Design.
