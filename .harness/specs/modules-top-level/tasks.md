# modules-top-level — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Move `.agents/modules` to `modules/`; installer, versions, package, CI, spec-drift adapter lookup, docs | REQ-001 REQ-002 REQ-003 REQ-004 | `modules/**`, `scripts/install-into.sh`, `scripts/generate-versions.mjs`, `package.json`, `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json`, `tools/spec-drift/src/audit/audit.service.ts`, `tools/spec-drift/test/audit.e2e-spec.ts`, `README.md`, `.agents/agents/README.md`, `.agents/mcp/README.md`, `runtimes/cursor/asdd-steering.mdc`, `.harness/features/*.features.json` |
