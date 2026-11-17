# tracker-binding — Spec (lite)

## Intent

P6.1 (gap G23). The PO/PM writes pitches and intents in the project's tracker, and engineers read intents from it, so
the project must declare which tracker it uses. Today `project.json` has no tracker field; skills ask or guess. Add a
`tracker` block (`type: jira | linear | github`, the project/team/repo, how a pitch container and an intent item are
identified) validated by `asdd check-config`, and define the canonical Intent format for tracker items: the
`intent.md` content plus a grounding table (Reuse / Extend / New with evidence refs), suggested mode and slice id,
and appetite with its reference slices — mapped per tracker type.

Mapped: `cli/scaffold/config/project.schema.json` (source), `.harness/config/project.schema.json` (copy, `asdd kit self`), `cli/scaffold/config/README.md`, `.harness/config/README.md` (copy), `cli/src/harness/check-project-config.mjs`, `cli/src/harness/tracker-config.mjs` (new), `cli/src/harness/tracker-config.test.mjs` (new), `package.json` (`test` script entry), `cli/skills/external-trackers/references/intent-format.md` (new), `cli/skills/external-trackers/references/mcp-configurations.md`, `.agents/skills/external-trackers/references/intent-format.md` and `.agents/skills/external-trackers/references/mcp-configurations.md` (copies, `asdd kit self`), `cli/versions.json` and `.harness/config/versions.json` (regenerated, `asdd kit versions`)

## Requirements

- **REQ-001.** `project.json` shall accept an optional `tracker` block with `type` (`jira`, `linear`, or `github`) and the fields that type needs, and `asdd check-config` shall FAIL on an unknown type or a missing required field.
- **REQ-002.** The kit shall document one canonical Intent item format: the `intent.md` sections, a grounding table whose rows carry evidence refs (`REQ-…`, slice ids, repo paths), suggested mode and slice id, appetite with reference slices, and the parent pitch link.
- **REQ-003.** The Intent format shall state how it maps to each tracker type (issue type / label / parent link) and how it is read back (MCP tool names from `mcp-configurations.md`).

## Depends on

None. Unblocks: `grounded-shaping`, `intent-intake`.
