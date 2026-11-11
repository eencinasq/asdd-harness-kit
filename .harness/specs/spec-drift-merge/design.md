# spec-drift-merge — Design (lite)

## What changes

| Area | Files |
|------|-------|
| Audit feature module | `tools/spec-drift/src/audit/**` |
| Audit MCP App view | `tools/spec-drift/ui/audit-dashboard.html`, `tools/spec-drift/ui/audit-dashboard/**` |
| Wiring | `tools/spec-drift/src/app.module.ts`, `tools/spec-drift/src/config/env.schema.ts`, `tools/spec-drift/package.json`, `tools/spec-drift/bin/spec-drift.mjs`, `tools/spec-drift/bin/mcp-stdio`, `tools/spec-drift/README.md`, `tools/spec-drift/docs/PLAYBOOK.md`, `tools/spec-drift/test/**` |
| Removed | `.agents/mcp/spec-drift-auditor.mjs`, `.agents/mcp/spec-drift-auditor.test.mjs`, `.agents/mcp/ui/drift-dashboard.html`, `tools/drift-dashboard/**` |
| Kit wiring | `.agents/mcp/mcp.json`, `.agents/mcp/README.md`, `scripts/install-into.sh`, `scripts/test-install-into.sh`, `package.json`, `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json` |
| Docs that name the server | `AGENTS.md`, `README.md`, `runtimes/cursor/asdd-steering.mdc`, `.agents/agents/asdd-implementation-agent.md`, `.agents/skills/codebase-audit/SKILL.md`, `.agents/modules/README.md`, `.agents/modules/http-api/adapters/openapi.mjs`, `.harness/audits/README.md`, `.harness/scripts/audit-lib.mjs`, `.harness/scripts/learning-lib.mjs`, `.harness/scripts/drift-lib.mjs`, `.harness/scripts/semgrep-lib.mjs`, `.harness/steering/*.md`, `scripts/templates/bindings/quality-gates.project.md` |

## Design

- `AuditService` takes `{ root, scriptsDir, semgrepBin, gateTimeoutMs }`. In the server they come from
  `HARNESS_ROOT` (default: working directory), `HARNESS_SCRIPTS_DIR` (default `<root>/.harness/scripts`),
  `HARNESS_SEMGREP`, and `HARNESS_GATE_TIMEOUT_SECONDS`. The harness libraries are imported dynamically
  from `scriptsDir`, so the package carries no copy of the checks.
- Paging (`audit-paging.ts`) is pure: `compactForUi`, `findingsPage`, and a bounded page store.
  The Nest server is stateless per request and cannot see whether the host declared MCP Apps, so audit
  results always carry `structuredContent` and are always compacted (the text equals the structured
  payload). `include_text` defaults to false, and the model asks for a source text with `source`.
- The view reuses `ui/shared` (styles, tabs, filters, status) and `@modelcontextprotocol/ext-apps`, like
  `analysis-dashboard`. The pure view logic (`model.ts`) is a typed port of the React dashboard's `model.js`.

## New domain terms

None.
