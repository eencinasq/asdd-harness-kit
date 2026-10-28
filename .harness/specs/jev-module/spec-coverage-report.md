# Spec Coverage Report: jev-module

## Gate Decision
BLOCKED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% (`npm test` 130/130 at f0fd4e5) | PASS |
| MUST requirement coverage | 100% | 9/11 (REQ-006, REQ-008 untested) | **BLOCK** (`QG-SPEC-05`) |
| EARS criteria coverage (MUST) | 100% | 5/7 (AC-004, AC-005 untested) | **BLOCK** (`QG-SPEC-06`) |
| SHOULD requirement coverage | ≥ 95% | 0/3 named (REQ-011 … REQ-013) | WARN |
| Spec coverage | ≥ 95% | — (re-measure after fixes) | — |

Coverage was counted by hand from tests that name this slice (`jev-module REQ-…`), not by `DRIFT-04`, which matches any test in the repo with the same ID (kit-hygiene OBS-001).

## Uncovered Requirements
| ID | Requirement | Missing Coverage | Severity |
|----|-------------|------------------|----------|
| UNCOV-001 | REQ-006 / AC-004 | `check-project-config` fails with `modules.jev: true` and no `capabilities.jev`, and with a non-empty `apiKey` | BLOCK |
| UNCOV-002 | REQ-008 / AC-005 | installed skills name `modules.jev`, keep "never fake a pass" for the module branch, and record `decided_by` | BLOCK |
| UNCOV-003 | REQ-011 | default install has no `validators/jev-gold-plating.mjs` | WARN |
| UNCOV-004 | REQ-012 | core guidance points to the `command-gate.mjs` CLI; the MCP tool says "Deprecated" | WARN |
| UNCOV-005 | REQ-013 | budget stage named for this slice | WARN |

## Domain Placement Findings
None.

## Code Review Notes
[code-review-report.md](code-review-report.md): reviews 1–2, no CRITICAL/HIGH/MEDIUM.

## Recommendation
RETURN_TO_IMPLEMENTATION — reopen TASK-001 (owner of the tests, SP-002) for UNCOV-001 … 005.
