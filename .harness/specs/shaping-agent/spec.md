# shaping-agent — Spec (lite)

## Intent

P6.2 (gap G24). The PO/PM shapes in Claude Desktop (Code tab) or claude.ai/code on the repository, which must stay
read-only for them: their output goes to the tracker, never to repo files. Add an `asdd-shaping-agent` whose
capabilities allow reading, running read-only commands, and MCP (knowledge, tracker), and deny file writes and edits,
so the rendered runtime agents enforce it (Claude Code: `tools` without `Write`/`Edit`). It mounts `shape-up`,
`product-delivery`, `codegraph`, and `external-trackers`.

Mapped: `cli/agents/asdd-shaping-agent.md` (new source), `.agents/agents/asdd-shaping-agent.md` (copy, `asdd kit self`), `cli/agents/README.md`, `cli/versions.json` (regenerated)

## Requirements

- **REQ-001.** The kit shall ship `asdd-shaping-agent`, conforming to `asdd kit agents-lint`, with capabilities that deny `write_file` and `edit_file` and allow MCP tools.
- **REQ-002.** The Claude Code rendering of the agent shall carry no `Write` and no `Edit` tool, and the Cursor and OpenCode renderings shall express the same denial.
- **REQ-003.** The agent shall state its operational boundary: evidence from the repository, output only to the configured tracker.

## Depends on

None (uses the tracker binding when present).
