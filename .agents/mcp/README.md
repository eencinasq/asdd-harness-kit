# Shared MCP (kit baseline)

**Canonical:** [`mcp.json`](mcp.json) — **codegraph only**.

Optional servers (chrome-devtools, playwright, storybook) belong to modules — add them when you enable [`.agents/modules/`](../modules/README.md).

## Launchers

| Script | Role |
|--------|------|
| `bin/codegraph-mcp.cjs` | `codegraph serve --mcp` |
| `bin/npx-mcp.cjs` | `npx` wrapper for optional MCP packages |
| `bin/resolve-node.cjs` | Shared Node resolution |

Requires Node on PATH and preferably `npm i -g codegraph`.

After editing `mcp.json` for Codex/OpenCode projections:

```bash
node .agents/mcp/sync-runtime-mcp.cjs
```

(Projection configs for Codex/OpenCode are optional; add when those runtimes are wired.)
