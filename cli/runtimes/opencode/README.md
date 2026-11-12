# OpenCode runtime adapter

The canonical agents and skills stay under `.agents`. The installer renders `.opencode/agents/asdd-*.md` with
`mode: subagent`, ordered `permissions` (edits denied outside the agent's `write_paths`, sub-agents denied except for the
orchestrator), and `steps`; links `.opencode/skills`; and maintains the project-level `opencode.json` MCP projection.

Invoke agents by name, e.g. `asdd-discovery-agent`. Edit `.agents/agents/`, not the rendered files.
