# spec-drift-demand — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Drift origin | REQ-001 | `tools/spec-drift/src/analysis/domain/drift-origin.ts`, `tools/spec-drift/src/analysis/domain/drift-origin.spec.ts`, `tools/spec-drift/src/analysis/analysis.service.ts`, `tools/spec-drift/src/analysis/analysis.tools.ts`, `tools/spec-drift/src/analysis/analysis.output.ts`, `tools/spec-drift/src/analysis/analysis.schemas.ts`, `tools/spec-drift/test/drift-origin.e2e-spec.ts`, `tools/spec-drift/test/mcp.e2e-spec.ts` | — |
| TASK-002 Guided fix | REQ-002 | `tools/spec-drift/src/analysis/domain/fix-prompt.ts`, `tools/spec-drift/src/analysis/domain/fix-prompt.spec.ts`, `tools/spec-drift/src/analysis/analysis.prompts.ts`, `tools/spec-drift/ui/analysis-dashboard`, `tools/spec-drift/test/fix-prompt.e2e-spec.ts`, `tools/spec-drift/test/ui.e2e-spec.ts` | TASK-001 |
| TASK-003 Review cost and time | REQ-003 | `tools/spec-drift/src/pr-review/metrics`, `tools/spec-drift/src/pr-review/pr-review.service.ts`, `tools/spec-drift/src/pr-review/pr-review.tools.ts`, `tools/spec-drift/src/pr-review/workspace`, `tools/spec-drift/test/pr-review.e2e-spec.ts` | TASK-002 |
| TASK-004 CI mode | REQ-004 | `tools/spec-drift/src/cli`, `tools/spec-drift/bin/spec-drift.mjs`, `tools/spec-drift/src/common/process/process-runner.service.ts`, `tools/spec-drift/test/ci-review.e2e-spec.ts` | TASK-003 |
| TASK-005 CodeQL engine | REQ-005 | `tools/spec-drift/src/analysis/engines/codeql`, `tools/spec-drift/src/app.module.ts`, `tools/spec-drift/src/config/env.schema.ts`, `tools/spec-drift/test/codeql.e2e-spec.ts` | TASK-004 |
| TASK-006 Multi-repo overview and docs | REQ-006 | `tools/spec-drift/src/analysis/domain/repos-overview.ts`, `tools/spec-drift/src/analysis/domain/repos-overview.spec.ts`, `tools/spec-drift/src/analysis/analysis.service.ts`, `tools/spec-drift/src/analysis/analysis.tools.ts`, `tools/spec-drift/src/analysis/analysis.output.ts`, `tools/spec-drift/src/config/env.schema.ts`, `tools/spec-drift/test/repos-overview.e2e-spec.ts`, `tools/spec-drift/README.md`, `tools/spec-drift/docs` | TASK-005 |

Serial. Later tasks may reuse files of earlier ones; earlier tasks are re-verified when DRIFT-02 reopens them.
Plan note (TASK-002): `analysis.service.ts` (`scanAll`, every finding for the prompt) and `test/ui/host.ts` (the test host records `ui/message`) join the scope.
Plan note (TASK-005): `src/config/engine.ts` (`SPEC_DRIFT_ENGINE` parsing) joins the scope; language detection falls back to a folder walk outside git. Plan note (TASK-006): `test/mcp.e2e-spec.ts` (40 tools) joins the scope.
