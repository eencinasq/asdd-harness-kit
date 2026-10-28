# Spec Coverage Report: kit-hygiene

## Gate Decision
BLOCKED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% (`npm test` 128/128) | PASS |
| MUST requirement coverage | 100% | 10/11 (REQ-006 has no test that names it) | **BLOCK** (`QG-SPEC-05`) |
| EARS criteria coverage (MUST) | 100% | 8/8 acceptance criteria have a specific test | PASS |
| SHOULD requirement coverage | ≥ 95% | 1/2 (REQ-013 untested) | WARN (`QG-SPEC-07`) |
| Spec coverage | ≥ 95% | 11/13 with happy and error path | WARN (`QG-SPEC-08`) |
| COULD requirement coverage | INFO | n/a | INFO |

Coverage was counted by hand (`QG-SPEC-01`): a requirement counts only when a test that names it asserts it.

| REQ | Priority | Test |
|-----|----------|------|
| REQ-001 | MUST | `check-guidance.test.mjs` (removed mechanisms, kit-only files skipped) |
| REQ-002 | MUST | `check-guidance.test.mjs` AC-001; `test-install-into.sh` stale stage |
| REQ-003 | MUST | `sync-state.test.mjs` AC-002/003 |
| REQ-004 | MUST | `sync-state.test.mjs` AC-002 |
| REQ-005 | MUST | `sync-state.test.mjs` AC-004 |
| REQ-006 | MUST | **none names it** — the `cutoffs` stage of `test-install-into.sh` asserts it on the real agent prompts but cites only REQ-007 |
| REQ-007 | MUST | `check-guidance.test.mjs` AC-005 |
| REQ-008 | MUST | `command-gate.test.mjs` AC-006; `test-install-into.sh` upgrade test |
| REQ-009 | MUST | `command-gate.test.mjs` AC-006 parity and re-exports |
| REQ-010 | MUST | `check-guidance.test.mjs` AC-007; `test-install-into.sh` budget stage |
| REQ-011 | MUST | `test-install-into.sh` AC-008 (`cmp`, npm pack) |
| REQ-012 | SHOULD | `test-install-into.sh` AC-008 |
| REQ-013 | SHOULD | **none** |

## Uncovered Requirements
| ID | Requirement | Missing Coverage | Severity |
|----|-------------|------------------|----------|
| UNCOV-001 | REQ-006 | A test that names REQ-006 and asserts the shipped agent prompts have no cutoff | BLOCK |
| UNCOV-002 | REQ-013 | A test that asserts the always-loaded size is below 36,627 bytes | WARN |

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
RETURN_TO_IMPLEMENTATION — name REQ-006 in the test that asserts it and add a REQ-013 test; then re-run QA.
