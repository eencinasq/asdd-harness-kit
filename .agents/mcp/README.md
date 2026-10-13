# Shared MCP (kit baseline)

**Canonical:** [`mcp.json`](mcp.json) — codegraph + Jev stdio adapter (zero dependencies, no SDK required).

The `jev-gate` MCP server (`.agents/mcp/jev-gate-server.mjs`) exposes:

- **Skill gates (System One):** `jev_status`, `jev_shape_up_gates`, `jev_ears_gate`, `jev_slice_choice` — for `shape-up` and `product-delivery` only.
- **Command safety (no Jev):** `check_command_safety` — pattern allow/deny. Hooks call `.harness/scripts/jev-command-gate.mjs` directly; MCP serves runtimes that prefer a tool call.

See `.harness/steering/jev.md`.
Servers with `"enabled": false` are skipped by `sync-runtime-mcp.cjs` projections.

```bash
node --input-type=module -e "import { checkCommandSafety } from './.harness/scripts/jev-command-gate.mjs'; console.log(await checkCommandSafety('git status'))"
```
