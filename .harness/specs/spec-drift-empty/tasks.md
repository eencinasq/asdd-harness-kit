# spec-drift-empty — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Analysis: `no-rules` result, rules prompt (moved), MCP prompt, dashboard state | REQ-001 REQ-002 | `tools/spec-drift/src/analysis/**`, `tools/spec-drift/src/pr-review/architecture/**`, `tools/spec-drift/ui/analysis-dashboard/**`, `tools/spec-drift/ui/analysis-dashboard.html`, `tools/spec-drift/test/empty-analysis.e2e-spec.ts` | — |
| TASK-002 Kit: `.semgrep/architecture` config candidate | REQ-003 | `cli/src/harness/semgrep-lib.mjs`, `cli/src/harness/semgrep-lib.test.mjs`, `tools/spec-drift/src/harness/semgrep-lib.mjs`, `cli/steering/spec-drift.md`, `.harness/steering/spec-drift.md` | — |
| TASK-003 Audit: `no_data`, rules prompt on unconfigured architecture, dashboard "No data" | REQ-003 REQ-004 | `tools/spec-drift/src/audit/**`, `tools/spec-drift/ui/audit-dashboard/**`, `tools/spec-drift/test/empty-audit.e2e-spec.ts`, `tools/spec-drift/test/insight.e2e-spec.ts` | TASK-001, TASK-002 |
| TASK-004 Docs | REQ-001…004 | `tools/spec-drift/README.md` | TASK-003 |
