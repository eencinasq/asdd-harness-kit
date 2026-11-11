# spec-drift-merge — Spec (lite)

## Intent

Merge the zero-dependency `spec-drift-auditor` MCP server (`.agents/mcp/spec-drift-auditor.mjs`)
and its React MCP App (`tools/drift-dashboard/`) into the NestJS `spec-drift` MCP project
(`tools/spec-drift/`), the same way that project hosts its `analysis` and `pr-review` features:
a Nest feature module (`tools/spec-drift/src/audit/`) plus a framework-free MCP App view
(`tools/spec-drift/ui/audit-dashboard/`). The old server, its test, its prebuilt view
(`.agents/mcp/ui/drift-dashboard.html`), and `tools/drift-dashboard/` are removed. `mcp.json`, the
installer, CI, and docs point at `tools/spec-drift`. Every check still lives in `.harness/scripts`
(`drift-lib.mjs`, `semgrep-lib.mjs`, `audit-lib.mjs`, `learning-lib.mjs`), loaded from the
harness root at runtime, so Verify-on-Stop, CI, and chat keep running the same logic.

## Requirements

- **REQ-001.** The spec-drift server shall expose the tools `audit_diff`, `verify_architecture_rules`, `verify_spec_compliance`, `generate_ci_gate`, `audit_report`, and `audit_finding`, with the inputs and results of the former spec-drift-auditor server (author/review modes, triage, adapters, sources, paging).
- **REQ-002.** The spec-drift server shall expose the resources `spec://manifest`, `spec://rules/architecture`, and `spec://drift/latest-report`, and the prompts `architecture-review`, `spec-alignment`, and `pr-review`.
- **REQ-003.** When an audit tool returns findings over the MCP App size budget, the server shall return the first findings that fit, the full counts, and a page token that the same tool accepts (`page_token`, `offset`) to return the rest.
- **REQ-004.** The audit tools shall link the `ui://spec-drift/audit-dashboard.html` MCP App view, built from `tools/spec-drift/ui/audit-dashboard/` without React, which shows findings, checks, architecture sources, trace, and the author/review actions of the former dashboard.
- **REQ-005.** The audit tools shall not write files in the harness root.
- **REQ-006.** The installer shall ship `tools/spec-drift` (without `node_modules`, `dist`, or tests) and register the `spec-drift` server in `.agents/mcp/mcp.json`; the kit shall no longer ship `spec-drift-auditor`.
