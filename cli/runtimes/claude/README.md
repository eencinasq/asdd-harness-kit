# Claude Code runtime adapter

The installer renders `.claude/agents/asdd-*.md` from the canonical `.agents/agents/` files: each gets `tools` from its
`capabilities` (an auditor without `Edit`, `Agent` only for the orchestrator), or `disallowedTools` when it needs MCP
tools, plus `maxTurns`. It links `.claude/skills` to `.agents/skills`, exposes the shared MCP configuration as `.mcp.json`
at the project root, wires the Stop (verify) and PreToolUse (command gate) hooks, and creates `CLAUDE.md` pointing to
`AGENTS.md`. Edit `.agents/agents/`, not the rendered files.

It also wires a `PostToolUse` hook (matcher `Read|Skill`) that runs `asdd observe claude` to record steering and skill
loads in `.harness/state/telemetry/spans.jsonl`; the hook is fail-open (no `failClosed`, timeout 10) and exits 0 with no
output even when `asdd` is not installed.
