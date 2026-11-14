# spec-drift-adoption — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Baseline: domain, scan status, `spec-drift baseline` CLI, dashboard new-only | REQ-001 | `tools/spec-drift/src/analysis/domain/baseline.ts`, `tools/spec-drift/src/analysis/domain/baseline.spec.ts`, `tools/spec-drift/src/analysis/analysis.service.ts`, `tools/spec-drift/src/analysis/analysis.types.ts`, `tools/spec-drift/src/analysis/analysis.output.ts`, `tools/spec-drift/src/analysis/analysis.presenter.ts`, `tools/spec-drift/src/cli`, `tools/spec-drift/src/main.ts`, `tools/spec-drift/bin/spec-drift.mjs`, `tools/spec-drift/ui/analysis-dashboard`, `tools/spec-drift/ui/analysis-dashboard.html`, `tools/spec-drift/test/baseline.e2e-spec.ts` | — |
| TASK-002 Trend: snapshots, `spec-drift record`, `drift_trend`, dashboard chart | REQ-002 | `tools/spec-drift/src/analysis/domain/trend.ts`, `tools/spec-drift/src/analysis/domain/trend.spec.ts`, `tools/spec-drift/src/analysis/analysis.tools.ts`, `tools/spec-drift/src/audit/audit.service.ts`, `tools/spec-drift/test/trend.e2e-spec.ts`, `tools/spec-drift/test/mcp.e2e-spec.ts` (+ TASK-001 files) | TASK-001 |
| TASK-003 Toolsets | REQ-003 | `tools/spec-drift/src/config`, `tools/spec-drift/src/app.module.ts`, `tools/spec-drift/src/analysis/analysis.module.ts`, `tools/spec-drift/src/audit/audit.module.ts`, `tools/spec-drift/src/pr-review/pr-review.module.ts`, `tools/spec-drift/test/toolsets.e2e-spec.ts` | TASK-002 |
| TASK-004 Install: `spec-drift config`, guide, one name | REQ-004 | `tools/spec-drift/src/cli` (config), `tools/spec-drift/README.md`, `tools/spec-drift/docs`, `tools/spec-drift/package.json`, `cli/mcp/README.md` | TASK-003 |

Serial. TASK-002 and TASK-004 reuse files of earlier tasks; earlier tasks are re-verified when DRIFT-02 reopens them.
Plan note (TASK-002): `test/ui.e2e-spec.ts` joins the scope (the Trend tab is checked in a real host).
Plan note (TASK-004): the config e2e, the bin help, and the three PR-review files that still said "Architecture MCP" join the scope (one name).
