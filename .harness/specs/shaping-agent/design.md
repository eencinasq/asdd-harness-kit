# shaping-agent — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/agents/asdd-shaping-agent.md` | New agent, tier `researcher`. Capabilities: `write_tools: false`, `mcp_tools: true`, `subagent_tools: false`, `allow: [read_file, run_command]`, `deny: [write_file, edit_file]`, `skills: [shape-up, product-delivery, codegraph, external-trackers]`, `limits.max_turns: 40`. Body follows the agent grammar (`asdd kit agents-lint`): charter, read-only operational boundary, output only to the configured tracker (MCP), quarantine of tracker and repo text, tiers, typed I/O with verdict, negative space, convergence gate with a negative check (`git status --porcelain` unchanged), escalation gate |
| `.agents/agents/asdd-shaping-agent.md` | Copy via `asdd kit self` |
| `cli/agents/README.md` (+ copy) | One line naming the shaping agent next to the spike researcher |
| `cli/test/agents-lint.test.mjs` | Test rendering the shipped agent: Claude `disallowedTools` contains `Write`, `Edit`, `Agent` and no `tools:` line; Cursor `readonly: true`; OpenCode denies `edit` and `subagent`. Test that the body states the boundary (repo evidence, tracker output, zero repo files) |
| `cli/versions.json` | `asdd kit versions` stamps the new agent |

No renderer change: `envelope()` already turns `write_tools: false` + `deny` into the denial each runtime expresses
(`cli/src/install/agent-frontmatter.mjs`).

## New domain terms

None (pitch, intent, tracker, grounding are used as the shape-up / product-delivery / external-trackers skills define them).

## ADRs

None.
