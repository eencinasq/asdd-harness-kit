# asdd-cli — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 `asdd` CLI: install port, doctor, migrate, kit commands; tests under cli/test | REQ-001 REQ-002 REQ-003 REQ-004 REQ-005 | `cli/**`, `scripts/**` |
| TASK-002 Package, CI, generated headers, versions, docs point at the CLI | REQ-006 | `package.json`, `package-lock.json`, `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json`, `tools/*/src/harness/**`, `tools/*/README.md`, `tools/*/src/*/harness-libs.ts`, `README.md`, `runtimes/README.md`, `.agents/mcp/README.md`, `.harness/config/README.md`, `.harness/steering/{structure,product,tech,domain-layer.project,quality-gates.project,design-system}.md`, `docs/architecture/domain-model.md` |
| TASK-003 From eminzo-ai-factory `cli/`: hash ownership, install guards, `--json`, `--pr`, `asdd uninstall`, doctor checks | REQ-007 REQ-008 REQ-009 REQ-010 REQ-011 | `cli/**`, `package.json`, `README.md`, `.harness/config/versions.json` |
