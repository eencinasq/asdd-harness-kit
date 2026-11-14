# Spec Coverage Report: spec-drift-adoption

## Gate Decision
PASSED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% | PASS |
| MUST requirement coverage | 100% | 100% (4/4) | PASS |
| EARS criteria coverage (MUST) | 100% | 100% (AC-001…004) | PASS |
| SHOULD requirement coverage | ≥ 95% | none in spec | PASS |

## Coverage
| Requirement | Criterion | Tests |
|-------------|-----------|-------|
| REQ-001 | AC-001 | `src/analysis/domain/baseline.spec.ts`; `ui/analysis-dashboard/baseline-view.spec.ts`; `test/baseline.e2e-spec.ts` (Semgrep; CLI as a process) |
| REQ-002 | AC-002 | `src/analysis/domain/trend.spec.ts`; `ui/analysis-dashboard/trend-chart.spec.ts`; `test/trend.e2e-spec.ts`; `test/ui.e2e-spec.ts` (Trend tab in Chromium; screenshots inspected light and dark) |
| REQ-003 | AC-003 | `src/config/toolsets.spec.ts`; `test/toolsets.e2e-spec.ts` (stdio server per toolset value) |
| REQ-004 | AC-004 | `src/cli/client-config.spec.ts`; `test/config.e2e-spec.ts` (the printed config starts the server as pasted) |

## Evidence
tools/spec-drift typecheck OK, lint no errors, test 190/190, build OK, test:e2e 117/117 (Semgrep 1.183 and Chromium
installed, so those cases ran).

## Uncovered
None for this slice. INFO: the kit's `npm test` fails at `asdd kit vendor --check` because of uncommitted changes from
another work stream (slices asdd-p0…p4) in `cli/src/harness`; not caused by this slice, not changed by it.
