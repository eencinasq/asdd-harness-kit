# shaping-agent — Capability (backfilled on escalation from lite)

**Capability:** A PO or PM shapes pitches and intents with an agent that reads the repository and writes only to the
project's tracker.

- **Actor:** PO / PM in Claude Desktop (Code tab), claude.ai/code, or an IDE.
- **Outcome:** `asdd-shaping-agent` gathers evidence from code, specs, and past slices, and its runtime renderings
  deny repository writes (Claude Code `disallowedTools: Write, Edit, Agent`; Cursor `readonly: true`; OpenCode edit and
  sub-agent denied) while keeping MCP tools for knowledge and the tracker.
- **Out of scope:** the tracker binding (`tracker-binding`), the grounding steps inside the skills (`grounded-shaping`),
  and intent intake (`intent-intake`).
- **Escalation:** E1 only — the agent source is in `cli/agents/` and its kit-self copy in `.agents/agents/`.
