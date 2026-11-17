# Claude Code runtime adapter

The installer renders `.claude/agents/asdd-*.md` from the canonical `.agents/agents/` files: each gets `tools` from its
`capabilities` (an auditor without `Edit`, `Agent` only for the orchestrator), or `disallowedTools` when it needs MCP
tools, plus `maxTurns`. It links `.claude/skills` to `.agents/skills`, exposes the shared MCP configuration as `.mcp.json`
at the project root, wires the Stop (verify) and PreToolUse (command gate) hooks, and creates `CLAUDE.md` pointing to
`AGENTS.md`. Edit `.agents/agents/`, not the rendered files.

## Cloud environments (claude.ai/code, Claude Desktop Code tab)

A PO/PM without a local clone shapes against the repository in a Claude Code cloud environment ([Play O](../../../docs/PLAYBOOK.md#play-o--po-or-pm-shapes-into-the-tracker)).
The grounding step needs the asdd CLI, a codegraph index, and the knowledge index. Set this as the environment's setup
script (or run it once at the start of the session):

```bash
# kit checkout
bash cli/runtimes/claude/cloud-setup.sh
# project (asdd-harness-kit as a devDependency)
npm ci && bash node_modules/asdd-harness-kit/cli/runtimes/claude/cloud-setup.sh
```

Steps: prerequisites (node ≥ 22) → asdd CLI → MCP servers (only in a kit checkout, where `tools/` exists: Node ≥ 24.22.1
and pnpm) → codegraph (`npm i -g codegraph` when missing, then `codegraph init` or `codegraph sync`) → `asdd knowledge sync`
→ `asdd doctor` (report only). It stops with a non-zero exit at the first failed step and is safe to re-run.
`--plan` prints the steps and `--check` reports each prerequisite; neither changes anything.

| Variable | Use |
|---|---|
| `ASDD_NODE24_BIN` | Directory with a Node ≥ 24.22.1 `node`, when the `node` on PATH is older (kit checkout only) |
| `HARNESS_AUTHOR` | Author name for learning summaries (else the configured user name) |
| `HARNESS_GATE_MODE` | Set `HARNESS_GATE_MODE=readonly` for a PO/PM shaping session: the command gate allows only read commands (Play O) |

The installer does not copy the script into projects: it ships in the npm package under `cli/runtimes/claude/`.
