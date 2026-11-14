# rule-coverage — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 ADR coverage domain, `adr_coverage`, `write-adr-rule`, `adrCoverage` in the summary | REQ-001 REQ-002 | `tools/spec-drift/src/analysis/domain/adr-coverage.ts`, `tools/spec-drift/src/analysis/domain/adr-coverage.spec.ts`, `tools/spec-drift/src/analysis/analysis.service.ts`, `tools/spec-drift/src/analysis/analysis.tools.ts`, `tools/spec-drift/src/analysis/analysis.prompts.ts`, `tools/spec-drift/src/analysis/analysis.output.ts`, `tools/spec-drift/src/analysis/analysis.types.ts`, `tools/spec-drift/src/analysis/analysis.presenter.ts`, `tools/spec-drift/test/rule-coverage.e2e-spec.ts`, `tools/spec-drift/test/mcp.e2e-spec.ts` | — |
| TASK-002 Rule tests and `validate_rules`; `.semgrep` excluded from server scans | REQ-003 REQ-004 | `tools/spec-drift/src/analysis/domain/rule-readiness.ts`, `tools/spec-drift/src/analysis/domain/rule-readiness.spec.ts`, `tools/spec-drift/src/analysis/ports`, `tools/spec-drift/src/analysis/engines`, `tools/spec-drift/src/analysis/analysis.service.spec.ts`, `tools/spec-drift/src/pr-review/architecture/architecture-scan.service.ts`, `tools/spec-drift/test/rule-tests.e2e-spec.ts` | TASK-001 |
| TASK-003 Kit scan excludes `.semgrep` | REQ-003 | `cli/src/harness/semgrep-lib.mjs`, `cli/src/harness/semgrep-lib.test.mjs`, `tools/spec-drift/src/harness/semgrep-lib.mjs`, `cli/steering/spec-drift.md`, `.harness/steering/spec-drift.md` | — |
| TASK-004 Dashboard: ADR tab and test badges | REQ-002 REQ-005 | `tools/spec-drift/ui/analysis-dashboard`, `tools/spec-drift/ui/analysis-dashboard.html` | TASK-002 |
| TASK-005 Docs and roadmap | REQ-001…005 | `tools/spec-drift/README.md`, `tools/spec-drift/docs/ROADMAP.md` | TASK-003, TASK-004 |

Note: TASK-002 edits files TASK-001 also lists (service, tools, output, types, presenter); they run serially, and
TASK-001 is re-verified if TASK-002 changes its files (DRIFT-02).
Plan note (TASK-002): `validate_rules` adds to the service, tools, output, types, presenter, and the MCP contract test; they join TASK-002's scope, and TASK-001 is re-verified after it.
