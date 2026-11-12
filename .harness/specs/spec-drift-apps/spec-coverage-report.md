# Spec Coverage Report: spec-drift-apps

**Author:** asdd-pipeline (this session) · **Model/Tool:** claude-opus-5-5

## Gate Decision
PASSED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% (every test naming a REQ passes; `pnpm test` 113/113, `npm test` 132/132) | PASS |
| MUST requirement coverage | 100% | 100% (4/4) | PASS |
| EARS criteria coverage (MUST) | 100% | 100% (AC-001…004) | PASS |
| SHOULD requirement coverage | ≥ 95% | none in spec (100%, QG-SPEC-02) | PASS |
| Spec coverage | ≥ 95% | 100% | PASS |
| COULD requirement coverage | INFO | none in spec | INFO |

## Coverage by requirement
| Requirement | Criterion | Tests that name it |
|---|---|---|
| REQ-001 | AC-001 | `test/output-schemas.e2e-spec.ts` (declared object schemas on 11 tools; client-side validation of real results; errors stay tool errors); `test/insight.e2e-spec.ts` (the two new tools are typed); the audit and analysis e2e suites call every tool, and the SDK rejects a result that fails its schema |
| REQ-002 | AC-002 | `cli/src/harness/learning-lib.test.mjs` (learningReport: open + proposed patterns, missing fields equal the invariants', no file written); `ui/audit-dashboard/model.spec.ts` (learning view); `test/insight.e2e-spec.ts` (learning_report end to end, snapshot unchanged) |
| REQ-003 | AC-003 | `ui/audit-dashboard/model.spec.ts` (triage is a command, messageFor refuses dismiss/confirm); `test/insight.e2e-spec.ts` (no triage tool; every audit tool readOnlyHint) |
| REQ-004 | AC-004 | `src/audit/audit-query.spec.ts` (counts, filters, path groups, limit, paths cap, input unchanged); `test/insight.e2e-spec.ts` (audit_query over a real report, no file changed) |

## Uncovered Requirements
None.

## Domain Placement Findings
None.

## Code Review Notes
- `pnpm test:e2e` 95/96: the one failure (`MCP server (in-memory) > analyze_spec_drift runs through the service`) fails
  identically at HEAD without this slice — the test sets `ANALYSIS_REPO_ROOT` after `AppModule` is imported, so the
  analyzer finds no `.semgrep/`. Pre-existing, outside this slice; recorded for a follow-up.
- Fixed in passing: the stale `generate_ci_gate` e2e assertion (the CI template installs the pinned kit and runs
  `asdd check` since the cli-package change).
- Found in passing (harness): a directory scope hashes deleted-but-still-indexed files as `<missing>`, so committing a
  deletion reopens the feature (DRIFT-02) with no content change. Recorded for a follow-up.

## Recommendation
PROCEED
