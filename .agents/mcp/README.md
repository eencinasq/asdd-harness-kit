# Shared MCP (kit baseline)

**Canonical:** [`mcp.json`](mcp.json) — codegraph + Jev stdio adapter (zero dependencies, no SDK required).

Harness command safety policy lives in `.harness/scripts/jev-command-gate.mjs` (single source of truth).
The `jev-gate` MCP server is a thin stdio adapter over that same policy, exposed as the
`check_command_safety` tool. Hook enforcement (Cursor `beforeShellExecution`, Claude `PreToolUse`)
calls `jev-command-gate.mjs` directly; the MCP tool serves runtimes that prefer native MCP gating.
Servers with `"enabled": false` are skipped by `sync-runtime-mcp.cjs` projections.

```bash
node --input-type=module -e "import { checkCommandSafety } from './.harness/scripts/jev-command-gate.mjs'; console.log(await checkCommandSafety('git status'))"
```
