# Spec Coverage Report: spec-drift-demand

## Gate Decision
PASSED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% | PASS |
| MUST requirement coverage | 100% | 100% (6/6) | PASS |
| EARS criteria coverage (MUST) | 100% | 100% (AC-001…006) | PASS |
| SHOULD requirement coverage | ≥ 95% | none in spec | PASS |

## Coverage
| Requirement | Criterion | Tests |
|-------------|-----------|-------|
| REQ-001 | AC-001 | `src/analysis/domain/drift-origin.spec.ts`; `test/drift-origin.e2e-spec.ts` |
| REQ-002 | AC-002 | `src/analysis/domain/fix-prompt.spec.ts`; `test/fix-prompt.e2e-spec.ts`; `test/ui.e2e-spec.ts` (button → host message) |
| REQ-003 | AC-003 | `src/pr-review/metrics/review-cost.spec.ts`; `test/pr-review.e2e-spec.ts` (cost in metrics.jsonl and pr_review_metrics) |
| REQ-004 | AC-004 | `src/cli/ci-review.spec.ts`; `test/ci-review.e2e-spec.ts` |
| REQ-005 | AC-005 | `src/analysis/engines/codeql/codeql.spec.ts` (stubbed CLI); `test/codeql.e2e-spec.ts` |
| REQ-006 | AC-006 | `src/analysis/domain/repos-overview.spec.ts`; `test/repos-overview.e2e-spec.ts` |

## Evidence
tools/spec-drift typecheck OK, lint no errors (2 pre-existing warnings), test 226/226, build OK, test:e2e 140/140.

## Uncovered
- REQ-005: not run against a real CodeQL CLI (not installed here). REQ-004: the workflow was not run on GitHub Actions.
- The kit's `npm test` still fails at `asdd kit vendor --check` because of the other work stream; not caused by this slice.
