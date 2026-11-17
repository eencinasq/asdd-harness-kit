# shaping-agent — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** The kit shall ship `asdd-shaping-agent`, conforming to `asdd kit agents-lint`, with capabilities that deny `write_file` and `edit_file` and allow MCP tools.
- **REQ-002.** The Claude Code rendering of the agent shall carry no `Write` and no `Edit` tool, and the Cursor and OpenCode renderings shall express the same denial.
- **REQ-003.** The agent shall state its operational boundary: evidence from the repository, output only to the configured tracker.
