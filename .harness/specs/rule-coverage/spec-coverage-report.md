# Spec Coverage Report: rule-coverage

## Gate Decision
PASSED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% | PASS |
| MUST requirement coverage | 100% | 100% (5/5) | PASS |
| EARS criteria coverage (MUST) | 100% | 100% (AC-001…005) | PASS |
| SHOULD requirement coverage | ≥ 95% | none in spec | PASS |

## Coverage
| Requirement | Criterion | Tests |
|-------------|-----------|-------|
| REQ-001 | AC-001 | `src/analysis/domain/adr-coverage.spec.ts` (7); `test/rule-coverage.e2e-spec.ts` (adr_coverage, summary adrCoverage) |
| REQ-002 | AC-002 | `adr-coverage.spec.ts` (prompt); `rule-coverage.e2e-spec.ts` (write-adr-rule) |
| REQ-003 | AC-003 | `semgrep.spec.ts` (authoring guide); `analysis.service.spec.ts` (exclude + filter, analysis and PR scan); `test/rule-tests.e2e-spec.ts` (real Semgrep: fixture not a finding); `cli/src/harness/semgrep-lib.test.mjs` |
| REQ-004 | AC-004 | `rule-readiness.spec.ts`; `semgrep.spec.ts` (parseTestOutput); `analysis.service.spec.ts` (engine without tests never ready); `rule-tests.e2e-spec.ts` (validate_rules) |
| REQ-005 | AC-005 | `ui/analysis-dashboard/rule-coverage.spec.ts`; `test/ui.e2e-spec.ts` (dashboard renders in a real host) |

## Evidence
Kit `npm test` 137/137; tools/spec-drift typecheck, lint (no errors), test 175/175, build + test:e2e 107/107 (Semgrep
1.183 installed, so the Semgrep cases ran); jev-gate 14/14; knowledge 8/8.

## Uncovered
None. INFO: the "Ask the agent" button is exercised through its view model, not clicked in the host test.
