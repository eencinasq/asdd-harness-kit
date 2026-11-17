# tracker-binding — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** `project.json` shall accept an optional `tracker` block with `type` (`jira`, `linear`, or `github`) and the fields that type needs, and `asdd check-config` shall FAIL on an unknown type or a missing required field.
- **REQ-002.** The kit shall document one canonical Intent item format: the `intent.md` sections, a grounding table whose rows carry evidence refs (`REQ-…`, slice ids, repo paths), suggested mode and slice id, appetite with reference slices, and the parent pitch link.
- **REQ-003.** The Intent format shall state how it maps to each tracker type (issue type / label / parent link) and how it is read back (MCP tool names from `mcp-configurations.md`).
