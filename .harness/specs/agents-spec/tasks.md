# agents-spec — Tasks

Each agent file is touched once for P1–P3 (no later task reopens it).

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Upstream agents (discovery, spec, validation, domain, design, task-planning) | REQ-001 REQ-003 | `cli/agents/asdd-{discovery,spec,validation,domain,design,task-planning}-agent.md` | — |
| TASK-002 Downstream agents + spike researcher + shared contract; QA/Knowledge single roles | REQ-001 REQ-002 REQ-003 | `cli/agents/asdd-{implementation,qa,refactor,knowledge,lite}-agent.md`, `cli/agents/asdd-spike-researcher.md`, `cli/agents/_runtime-template.md`, `cli/agents/README.md`, `cli/steering/templates/spec-peer-review.md`, `cli/scaffold/config/models.json` | — |
| TASK-003 Module agents; Playwright runbook to a module skill | REQ-003 REQ-005 | `cli/modules/bruno/asdd-integration-tester.md`, `cli/modules/playwright-e2e/**`, `cli/src/install/modules.mjs` | — |
| TASK-004 Runtime projection (Claude Code, Cursor, OpenCode) | REQ-004 | `cli/src/install/agent-frontmatter.mjs`, `cli/src/install/runtimes.mjs`, `cli/src/install/context.mjs`, `cli/test/install.sh` | TASK-001…003 |
| TASK-005 `asdd kit agents-lint` in `npm test` | REQ-002 REQ-005 REQ-006 | `cli/src/kit/agents-lint.mjs`, `cli/src/main.mjs`, `cli/test/agents-lint.test.mjs`, `package.json`, `cli/README.md`, `cli/versions.json` | TASK-001…004 |
