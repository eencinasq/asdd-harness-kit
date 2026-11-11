# agents-use-scripts — Design (lite)

- `knowledge-query.mjs` holds the query logic that lived in `tools/knowledge/src/knowledge/knowledge.service.ts` and `search.ts`; the service is now a thin wrapper over its vendored copy, and `search.ts` is gone.
- `jev-gates.mjs` gains `statusVerdict`, `shapeUpVerdict`, `earsVerdict`, `scopeVerdict` (`{ payload, failed }`, fail closed) and CLI commands over them; `JevService` delegates to them.
- MCP tool → script: `knowledge_*` → `knowledge-query.mjs <cmd>`; `jev_*` → `jev-gates.mjs <cmd>`; `audit_diff` → `check-spec-drift.mjs` (`--base/--target/--pr-branch/--pr-body` for review); `verify_spec_compliance` → `check-spec-drift.mjs --slice <id> --requirements`; `audit_report` / `audit_finding` → `.harness/audits/<timestamp>.json`, `audit-triage.mjs --list`, `knowledge-query.mjs trace file:<path>`.

## Scope

TASK-001: `.harness/scripts/knowledge-query.mjs`, `.harness/scripts/jev-gates.mjs`, `.harness/scripts/sync-knowledge.test.mjs`, `.harness/scripts/jev-client.test.mjs`, `scripts/vendor-harness-libs.mjs`, `tools/knowledge/**`, `tools/jev-gate/**`, `scripts/install-into.sh`, `scripts/test-install-into.sh`, `.harness/config/versions.json`.

TASK-002: `.agents/agents/*.md`, `.agents/skills/shape-up/SKILL.md`, `.agents/skills/product-delivery/**`, `.agents/skills/capability-discovery/SKILL.md`, `.agents/skills/codebase-audit/SKILL.md`, `AGENTS.md`, `runtimes/cursor/asdd-steering.mdc`, `.harness/steering/{knowledge,jev,spec-drift,controls}.md`, `.harness/steering/templates/intent.md`, `README.md`, `.agents/mcp/README.md`.
