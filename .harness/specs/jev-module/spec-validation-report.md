# Spec Validation Report: jev-module

## Gate Decision
PASSED

> Re-validation (2026-10-28) after the spec revision; first run BLOCKED by VAL-001.

## Summary
Validated the 13 requirements against the intent and the installer (`install_harness_scaffold`, `install_mcp`, `enable_modules`, the project.json template and upgrade patcher). One MUST requirement makes the module impossible to drop for every existing project.

## Findings

### BLOCKED
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| VAL-001 | REQ-005 | **Resolved** by REQ-014 (`--remove-modules=jev`) and the explicit-off rule in REQ-005; AC-007 tests it. Original: Every project installed by kit ≤ 3.8.1 has `.harness/scripts/jev-gates.mjs` and `capabilities.jev.enabled: true` (both were seeded unconditionally). REQ-005 therefore enables Jev on every existing project, including teams that never used it, and no requirement lets them turn it off. The intent's outcome ("a team installs the kit without Jev") is unreachable for existing adopters. | RESOLVED |

### WARN
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| — | — | none | — |

### INFO
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| VAL-002 | REQ-004 | `--modules=all` makes the skills require Jev; without `JEV_API_KEY` they stop at the gate. Document it next to the flag. | INFO |
| VAL-003 | REQ-003 | `scripts/test-full-flow.sh` must install with `--modules=jev` to keep its live Jev stages. | INFO |

## Anti-Pattern Score
1.00

## Uncertainty Factors
- Removing files on request is new for the installer (it only adds or refreshes today).

## Recommendation
PROCEED — no BLOCKING or HIGH finding remains (QG-VAL-04/05). VAL-002/003 carry into Design.
