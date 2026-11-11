# knowledge-nest — Design (lite)

| Area | Files |
|------|-------|
| New server | `tools/knowledge/**` |
| Removed | `.agents/mcp/knowledge-server.mjs`; its MCP cases move from `.harness/scripts/sync-knowledge.test.mjs` to `tools/knowledge/test/knowledge.e2e-spec.ts` |
| Kit wiring | `.agents/mcp/mcp.json`, `scripts/install-into.sh`, `scripts/test-install-into.sh`, `scripts/generate-versions.mjs`, `package.json`, `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json` |
| Docs | `README.md`, `.agents/mcp/README.md`, `.harness/steering/knowledge.md`, `.harness/steering/structure.md` |
| jev-gate-nest | `.harness/features/jev-gate-nest.features.json`, `.harness/specs/jev-gate-nest/design.md` (drop the deleted file from scope) |

- `main.ts` `chdir`s to `HARNESS_ROOT`; `KnowledgeService` opens the store at that root per call and closes it.
- The installer's `upgrade_jev_gate_entry` becomes `upgrade_legacy_entry <name> <retired script>`, used by both
  jev-gate and knowledge.
- Trade-off: the server is no longer zero-dependency; like spec-drift it needs one `pnpm install && pnpm build`
  (Node ≥ 24.22.1), and the launcher says so until then.

New domain terms: none.
