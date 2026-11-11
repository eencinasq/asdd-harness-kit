# mcp-standalone — Design (lite)

| Area | Files |
|------|-------|
| Vendoring | `scripts/vendor-harness-libs.mjs`; generated `tools/{spec-drift,jev-gate,knowledge}/src/harness/**` |
| Servers | `tools/spec-drift/src/audit/{harness-libs,audit.service,audit.module}.ts`, `tools/spec-drift/src/config/env.schema.ts`; `tools/jev-gate/src/jev/{harness-libs,jev.service,jev.module}.ts`, `tools/jev-gate/src/config/env.schema.ts`; `tools/knowledge/src/knowledge/{harness-libs,knowledge.service,knowledge.module}.ts`, `tools/knowledge/src/config/env.schema.ts` |
| Config | `tools/*/tsconfig.json` (`allowJs`), `tools/*/biome.json` (skip `src/harness`), `tools/knowledge/package.json` + lockfile (optional `sqlite-vec`) |
| Tests | `tools/*/test/*.e2e-spec.ts` (no kit scripts), `scripts/test-install-into.sh` |
| Kit | `package.json` (`--check` in `npm test`, `vendor:harness`), `.github/workflows/harness-invariants.yml`, `.harness/config/versions.json` |
| Docs | `tools/*/README.md`, `.agents/mcp/README.md`, `README.md`, `.harness/steering/structure.md` |

- Entries per server; the script follows relative static and dynamic imports, so each copy set is the closure.
- Copies are verbatim plus a GENERATED header, minus the trailing `if (import.meta.url === …argv[1])` CLI block.
- TypeScript imports the copies statically (`allowJs`, `checkJs: false`) and casts them to the existing contracts.
- The knowledge store resolves `sqlite-vec` from the server's own `node_modules` now (optional dependency); without it
  search falls back to exact cosine, as before.
- Trade-off: logic is duplicated per server; parity is enforced by `--check`, not by sharing files.

New domain terms: none.
