---
inclusion: auto
tags:
  - discovery
  - design
---

# Technology stack — asdd-harness-kit

> **Project binding for the kit itself.** Never shipped: projects get the stub from `cli/templates/bindings/tech.md`.

## Languages & runtimes

| Layer | Technology |
|-------|------------|
| Language | JavaScript (ES modules, `.mjs`), Bash |
| Runtime | Node.js 22+ (22.5+ for `node:sqlite`) |
| Framework(s) | None in shipped code (zero-dependency scripts and MCP servers); React + Vite only for the dashboard build in `tools/` |

## Verify / test commands

| Purpose | Command |
|---------|---------|
| Unit / project tests | `node --test <file>.test.mjs` |
| Full suite (SP-002) | `npm test` (also in `quality-gates.project.md`) |
| Lint / typecheck | none configured |

## API conventions (if any)

MCP servers speak line-delimited JSON-RPC 2.0 over stdio, without an SDK. Hook scripts read a JSON payload on stdin and always print a JSON verdict.

## Local ports / services

| Service | Port / URL |
|---------|------------|
| None | — |
