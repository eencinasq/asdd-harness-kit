# Spec Coverage Report: kit-hygiene

## Gate Decision
PASSED_WITH_WARNINGS

> Re-run after TASK-008 (2026-10-28). The first run was BLOCKED on UNCOV-001; history kept below.

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% (`npm test` 128/128) | PASS |
| MUST requirement coverage | 100% | 11/11 | PASS (was 10/11 → BLOCK) |
| EARS criteria coverage (MUST) | 100% | 8/8 acceptance criteria have a specific test | PASS |
| SHOULD requirement coverage | ≥ 95% | 2/2 | PASS |
| Spec coverage | ≥ 95% | 10/13 with both a happy-path and an error-path test (REQ-006 error path only through the REQ-007 fixture; REQ-012 and REQ-013 happy path only) | **WARN** (`QG-SPEC-08`) |
| COULD requirement coverage | INFO | n/a | INFO |

Coverage was counted by hand (`QG-SPEC-01`): a requirement counts only when a test that names it asserts it.

| REQ | Priority | Test |
|-----|----------|------|
| REQ-001 | MUST | `check-guidance.test.mjs` (removed mechanisms, kit-only files skipped) |
| REQ-002 | MUST | `check-guidance.test.mjs` AC-001; `test-install-into.sh` stale stage |
| REQ-003 | MUST | `sync-state.test.mjs` AC-002/003 |
| REQ-004 | MUST | `sync-state.test.mjs` AC-002 |
| REQ-005 | MUST | `sync-state.test.mjs` AC-004 |
| REQ-006 | MUST | `check-guidance.test.mjs` "REQ-006" (kit agents: 0 cutoffs); `test-install-into.sh` cutoffs stage (TASK-008) |
| REQ-007 | MUST | `check-guidance.test.mjs` AC-005 |
| REQ-008 | MUST | `command-gate.test.mjs` AC-006; `test-install-into.sh` upgrade test |
| REQ-009 | MUST | `command-gate.test.mjs` AC-006 parity and re-exports |
| REQ-010 | MUST | `check-guidance.test.mjs` AC-007; `test-install-into.sh` budget stage |
| REQ-011 | MUST | `test-install-into.sh` AC-008 (`cmp`, npm pack) |
| REQ-012 | SHOULD | `test-install-into.sh` AC-008 |
| REQ-013 | SHOULD | `check-guidance.test.mjs` "REQ-013" (33,922 < 36,627 bytes) (TASK-008) |

## Uncovered Requirements
| ID | Requirement | Missing Coverage | Severity |
|----|-------------|------------------|----------|
| UNCOV-001 | REQ-006 | **Closed** by TASK-008 | — |
| UNCOV-002 | REQ-013 | **Closed** by TASK-008 | — |
| UNCOV-003 | REQ-012 | Error path: an existing `project.json` that still declares `paths.progress`/`paths.locks` stays valid | WARN |
| UNCOV-004 | REQ-013 | Error path (a size bound has no separate failure behavior; the over-budget fixture of REQ-010 exercises the same measure) | WARN |

## Observations (sensor defects, logged per `QG-DEB-05`)
| ID | Finding |
|----|---------|
| OBS-001 | `DRIFT-04` reported compliance 1.0 although REQ-006 and REQ-013 have no test in this slice: requirement IDs are not namespaced by slice, so `REQ-006` in `drift-lib.test.mjs`, `spec-drift-auditor.test.mjs`, and `sync-knowledge.test.mjs` (earlier, now archived work) counts as coverage. False negative of the sensor. |
| OBS-002 | `runDrift` reports `must_requirements: 13`; REQ-012 and REQ-013 are SHOULD in the priority matrix. The requirement parser does not read priorities from the matrix. |

## Domain Placement Findings
None (`Active findings: none`; `npm test`, the bound gate command, passes).

## Code Review Notes
Delegation reviews 1–6 in [code-review-report.md](code-review-report.md): 0 CRITICAL/HIGH; CR-001, CR-005, CR-006 (MEDIUM) fixed.

## Recommendation
PROCEED after Tech Lead acknowledgment of the `QG-SPEC-08` WARN (UNCOV-003, UNCOV-004), per `QG-GATE-04`.
