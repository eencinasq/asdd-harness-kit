# pr-review-dashboard-ux — Hotfix

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 PR Review dashboard UX (coverage drill-down, header rev, security KPI/tab) | REQ-001, REQ-002, REQ-003, REQ-004 | `tools/spec-drift/ui/pr-review.html`, `tools/spec-drift/ui/pr-review/main.ts`, `tools/spec-drift/ui/shared/styles.css`, `tools/spec-drift/test/ui.e2e-spec.ts` |
| TASK-002 Security tab: built-in, repo security, generate button | REQ-005, REQ-006, REQ-007 | `tools/spec-drift/src/pr-review/architecture/architecture.types.ts`, `architecture-scan.service.ts`, `architecture-report.ts`, `architecture-scan.spec.ts`, `tools/spec-drift/ui/pr-review.html`, `tools/spec-drift/ui/pr-review/main.ts`, `tools/spec-drift/test/ui.e2e-spec.ts` |
| TASK-003 Built-in security pack always runs on Semgrep PR scans | REQ-008 | `architecture-scan.service.ts`, `architecture.types.ts`, `architecture-scan.spec.ts`, `ui/pr-review/main.ts` |
| TASK-004 Generate security rules button on legacy / missing repoSecurity | REQ-009 | `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-005 Human-readable Coverage drill-down | REQ-010, REQ-011, REQ-012 | `ui/pr-review/main.ts`, `ui/shared/styles.css`, `test/ui.e2e-spec.ts` |
| TASK-006 Architecture/Security KPI cards clickable with generate CTA | REQ-013 | `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-007 Code coverage KPI/tab: run JS/TS tests+coverage or generate CTA | REQ-014, REQ-015, REQ-016 | `src/pr-review/code-coverage/**`, `pr-review.types.ts`, `pr-review.service.ts`, `pr-review.module.ts`, `workspace/*`, `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-008 Code coverage Rescan always visible like Security | REQ-017 | `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-009 Inline comments KPI clickable opens Comments tab | REQ-018 | `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-010 Always show Ticket criteria KPI and Requirements tab | REQ-019 | `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-011 Reload button left of Review progress KPI | REQ-020 | `ui/pr-review.html`, `ui/shared/styles.css`, `test/ui.e2e-spec.ts` |
| TASK-012 Header Reload + Review progress; other KPIs stay clickable | REQ-021 | `ui/pr-review.html`, `ui/shared/styles.css`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-013 Unified Findings inbox + import + publish preview | REQ-022, REQ-023, REQ-024, REQ-025 | `src/pr-review/findings/**`, `architecture-import.ts`, `pr-review.schemas.ts`, `pr-review.service.ts`, `pr-review.tools.ts`, `ui/pr-review.html`, `ui/pr-review/main.ts`, `test/ui.e2e-spec.ts` |
| TASK-014 Engine wiring verification + full test coverage | REQ-026 | `src/pr-review/findings/**`, `pr-review.service.ts`, `test/pr-review.e2e-spec.ts`, `test/requirements.e2e-spec.ts`, `test/mcp.e2e-spec.ts`, `test/ui.e2e-spec.ts` |
