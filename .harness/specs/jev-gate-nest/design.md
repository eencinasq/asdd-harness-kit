# jev-gate-nest — Design (lite)

| Area | Files |
|------|-------|
| New server | `tools/jev-gate/**` |
| Removed | `.agents/mcp/jev-gate-server.mjs`, `.agents/mcp/jev-gate-server.test.mjs` |
| Kit wiring | `.agents/modules/jev/mcp.json`, `scripts/install-into.sh`, `scripts/test-install-into.sh`, `scripts/generate-versions.mjs`, `package.json`, `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json` |
| Docs | `README.md`, `.agents/mcp/README.md`, `.agents/modules/README.md`, `.harness/steering/jev.md`, `.harness/steering/structure.md` |

- `main.ts` `chdir`s to `HARNESS_ROOT` before loading the app: the jev scripts read `.harness/config/project.json`
  from `process.cwd()`. `JevService` loads the scripts from `HARNESS_SCRIPTS_DIR` (default `<root>/.harness/scripts`).
- The installer's `install_tool_source <name>` (shared with spec-drift) copies `bin docs scripts src ui` and the root
  config files; `generate-versions.mjs` versions the same set for both tools.

New domain terms: none.
