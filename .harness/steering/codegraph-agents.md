---
inclusion: auto
tags:
  - implementation
  - refactor
---

# Codegraph — per-agent checklist

Copy into Task / subagent prompts. Follow in **parent chat** and **every `asdd-*` subagent**.

Cursor: `preToolUse` hook (`.cursor/hooks/asdd-task-codegraph-inject.sh`) may append this mandate when missing.

## Mandatory

1. **Read** `.harness/steering/codegraph.md` at start of code-touching work.
2. **Invoke** Codegraph MCP **before** grep/Read loops for symbols, flows, or impact.
3. **Start with** `codegraph_explore` for feature/area / how-does-X / flow questions.
4. **List** Codegraph tools used in the final message.
5. **Fallback:** Read/Grep only for details Codegraph missed (comments, env config).

> There is no `codegraph_context` or `codegraph_trace`. Use `codegraph_explore`.

## Per-agent minimum

| Agent | Minimum Codegraph |
|-------|-------------------|
| discovery | `codegraph_explore` |
| spec | `codegraph_explore` |
| validation | `codegraph_explore` |
| domain | `codegraph_explore` |
| design | `codegraph_explore` |
| task-planning | `codegraph_explore` |
| implementation | `codegraph_explore` before edits |
| qa | `codegraph_explore` for REQ → code/tests |
| refactor | `codegraph_explore` |
| integration-tester | `codegraph_explore` for routes/controllers |
| e2e-tester | `codegraph_explore` for pages/testids |
| knowledge | `codegraph_explore` for spikes |

MCP: runtime-local (`.agents/mcp/mcp.json` (Cursor/Kiro/Junie symlink) or `.kiro/settings/mcp.json`). Index: `.codegraph/`. CLI fallback: `codegraph query`, `codegraph status`.
