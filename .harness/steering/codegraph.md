---
inclusion: auto
tags:
  - implementation
  - refactor
---

# Codegraph — code intelligence (mandatory)

**Source of truth for ASDD and all code-touching agents.** Index: `.codegraph/`. Prefer Codegraph **before** broad grep/Read.

## Tooling (current MCP)

Primary tool: **`codegraph_explore`**

- Natural-language questions, symbol bags, or file names → verbatim line-numbered source + call path + blast radius.
- Treat returned source as already Read; do not re-open those files unless a staleness banner says so.
- There is **no** `codegraph_context` or `codegraph_trace` on the current MCP — use `codegraph_explore` for those intents.

Server ids (discover at runtime): `codegraph`, `user-codegraph`, or workspace-prefixed (e.g. `project-0-…-codegraph`).

Cursor: `GetDynamicTools` / `CallDynamicTool` (or MCP equivalent). Kiro: MCP or CLI (`codegraph query`, `codegraph status`).

## Team setup (Cursor MCP)

Project config: [`.agents/mcp/mcp.json`](../../.agents/mcp/mcp.json) (Cursor/Kiro/Junie symlink) — **no machine-specific paths**. Cross-platform launcher (macOS / Linux / Windows):

```bash
node .agents/mcp/bin/codegraph-mcp.cjs
```

That launcher (`mcp.json` uses `command: node` + this script):

1. Resolves a real Node via [`resolve-node.cjs`](../../.agents/mcp/bin/resolve-node.cjs) (PATH, nvm, nvm-windows, fnm, volta, asdf — skips Cursor’s helper Node)
2. Resolves `codegraph` from `CODEGRAPH_BIN`, PATH, then version-manager bin dirs (`codegraph.cmd` on Windows)
3. Indexes the **repo root** (three levels above `.agents/mcp/bin/`), or `CODEGRAPH_PROJECT_PATH` if set

**Once per developer:**

```bash
npm install -g codegraph
# optional overrides:
# export CODEGRAPH_BIN=/path/to/codegraph          # Unix
# set CODEGRAPH_BIN=C:\Users\you\AppData\Roaming\npm\codegraph.cmd  # Windows
```

Then reload Cursor MCP (or restart Cursor). Confirm the `codegraph` server shows tools (at least `codegraph_explore`).

Do **not** put absolute home-directory paths in committed `.agents/mcp/mcp.json`.

## Rules

1. Call Codegraph **first** for how-does-X, architecture, flows, impact, or before editing unfamiliar modules.
2. List Codegraph tools used in the final message (proves compliance).
3. Fallback to Read/Grep only for configs, docs, or details Codegraph missed.
4. Do not invent tool names that are not on the MCP.

## Per-agent checklist

See [codegraph-agents.md](./codegraph-agents.md).
