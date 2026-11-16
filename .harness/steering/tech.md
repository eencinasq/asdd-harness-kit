---
inclusion: auto
tags:
  - discovery
  - design
classification: binding
---

# Technology stack — asdd-harness-kit

> **Project binding for the kit itself.** Never shipped: projects get the stub from `cli/templates/bindings/tech.md`.

## Languages & runtimes

| Layer | Technology |
|-------|------------|
| Language | JavaScript (ES modules, `.mjs`) and Bash for the CLI; TypeScript for the MCP servers in `tools/` |
| Runtime | CLI and hooks: Node.js 22+ (22.5+ for `node:sqlite`; the repo pins 22.23.3 in `.nvmrc`). Building `tools/*`: Node.js ≥ 24.22.1 (`tools/*/.nvmrc`) and pnpm 12 |
| Framework(s) | CLI: none (zero runtime dependencies; esbuild compiles `cli/src` → `cli/dist`). MCP servers: NestJS 12 + `@nestjs/mcp` + `@modelcontextprotocol/server` v2 + zod, bundled with esbuild. Spec-drift dashboards: Vite + `vite-plugin-singlefile` + `@modelcontextprotocol/ext-apps` |

## Verify / test commands

| Purpose | Command |
|---------|---------|
| Unit / project tests | `node --test <file>.test.mjs` |
| Full suite (SP-002) | `npm test` (also in `quality-gates.project.md`) |
| MCP server tests | `pnpm --dir tools/<server> test` (spec-drift also has `test:e2e`) |
| Lint / typecheck | CLI: `asdd kit skills-lint`, `asdd kit agents-lint`. `tools/*`: `pnpm --dir tools/<server> lint` (Biome) and `typecheck` (`tsc --noEmit`) |
| Build MCP servers | `pnpm --dir tools/<server> install --frozen-lockfile && pnpm --dir tools/<server> build` (`dist/` is gitignored; a server that is not built exits with "not built") |

## API conventions (if any)

MCP servers serve stdio by default (what `.mcp.json`, `.cursor/mcp.json`, and `.devin/mcp_config.json` launch) and Streamable HTTP with `--http`. Their harness logic comes from `src/**/harness-libs.ts`, which loads the vendored copies of `cli/src/harness` (`asdd kit vendor`). Hook scripts read a JSON payload on stdin and always print a JSON verdict.

## Local ports / services

| Service | Port / URL |
|---------|------------|
| spec-drift MCP (`--http`) | `http://127.0.0.1:3010/mcp` |
| jev-gate MCP (`--http`) | `http://127.0.0.1:3011/mcp` |
| knowledge MCP (`--http`) | `http://127.0.0.1:3012/mcp` |
