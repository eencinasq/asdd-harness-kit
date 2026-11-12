# spec-drift-apps — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Output schemas on audit and analysis tools | REQ-001 | `tools/spec-drift/src/audit/audit.output.ts`, `tools/spec-drift/src/audit/audit.tools.ts`, `tools/spec-drift/src/analysis/analysis.output.ts`, `tools/spec-drift/src/analysis/analysis.tools.ts`, `tools/spec-drift/test/output-schemas.e2e-spec.ts` | — |
| TASK-002 Shared proposal validation and `learningReport` in the harness | REQ-002 | `cli/src/harness/learning-lib.mjs`, `cli/src/harness/validators/learning.mjs`, `cli/src/harness/learning-lib.test.mjs`, `tools/spec-drift/src/harness/learning-lib.mjs` | — |
| TASK-003 `learning_report`, `audit_query`, read-only triage in the view | REQ-002 REQ-003 REQ-004 | `tools/spec-drift/src/audit/{audit-insight.tools,audit.module,audit.schemas,audit.service,audit.types,harness-libs,audit-query,audit-query.spec}.ts`, `tools/spec-drift/ui/audit-dashboard/**` | TASK-001, TASK-002 |
| TASK-004 Docs | REQ-001…004 | `tools/spec-drift/README.md` | TASK-003 |
