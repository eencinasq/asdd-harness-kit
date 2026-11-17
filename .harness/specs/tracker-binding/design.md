# tracker-binding — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/src/harness/tracker-config.mjs` (new) | `validateTrackerConfig(tracker)` → list of error strings; pure, no I/O. `TRACKER_TYPES`. |
| `cli/src/harness/tracker-config.test.mjs` (new) | Valid config per type; unknown type; each missing required field; wrong project format. |
| `cli/src/harness/check-project-config.mjs` | When `project.json` has `tracker`, push `validateTrackerConfig` errors (FAIL). Absent block: no change. |
| `cli/scaffold/config/project.schema.json` (+ copy) | Optional `tracker` property with per-type `if/then` required fields. |
| `cli/scaffold/config/README.md` (+ copy) | One paragraph on the `tracker` block with an example per type. |
| `cli/skills/external-trackers/references/intent-format.md` (new) | The canonical Intent item format (REQ-002) and its per-tracker mapping and read-back (REQ-003). |
| `cli/skills/external-trackers/references/mcp-configurations.md` | "Reading an Intent item" table: tool per tracker, pointer to `intent-format.md`. |
| `package.json` | `tracker-config.test.mjs` in the `test` script. |

## The `tracker` block

```json
"tracker": {
  "type": "jira",
  "project": "PROD",
  "site": "acme.atlassian.net",
  "pitch":  { "issue_type": "Epic" },
  "intent": { "issue_type": "Story", "label": "asdd-intent" }
}
```

| `type` | `project` | Also required | `pitch` | `intent` |
|---|---|---|---|---|
| `jira` | project key `^[A-Z][A-Z0-9_]+$` | `site` (Atlassian host) | `issue_type` (e.g. `Epic`) | `issue_type` and/or `label` |
| `linear` | team key `^[A-Z][A-Z0-9]*$` | — | `container`: `project` or `issue` (+ `label` when `issue`) | `label` |
| `github` | `owner/repo` | — | `label` | `label` |

FAIL on: `tracker` not an object; unknown `type`; a missing or empty required field; a `project` that does not match
its type's format; a `linear` pitch `container` other than `project`/`issue`.

## Intent item format (summary)

The item body is the `intent.md` content, prefixed by one fenced `asdd-intent` block of `key: value` lines (no YAML
library needed to parse it) and with a mandatory `## Grounding` table. Exact headings and keys in `intent-format.md`;
`asdd intake` (P6.4) validates against it.

## New domain terms

None (Intent, pitch, grounding already used by the shaping skills and the P6 roadmap).

## ADRs

None.
