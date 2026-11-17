# intent-intake — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/src/harness/intake-lib.mjs` (new) | Pure: `parseIntentItem(text)` (intent block, level-2 sections, grounding rows), `validateIntentItem(parsed)` (REQ-001 errors + unknown-key warnings), `parseRef(token)` / `resolveRef(root, ref)` / `staleRefs(root, rows)` (REQ-003), `renderIntentMd(parsed, { ref })` (intent.md with a generated `## Source`), `groundingFindings(root, markdown)` (shared with the validator) |
| `cli/src/harness/intake.mjs` (new) | `asdd intake --from <file\|-> --ref <url> [--accept-stale] [--dry-run] [--json]`: read local file or stdin, validate, re-check grounding, refuse an existing slice, run `init-slice.mjs <id> [--full\|--hotfix] --source-json <json>`, write `.harness/specs/<id>/intent.md`. No network |
| `cli/src/harness/init-slice.mjs` | `--source-json '<json object>'`: adds a `source` block to the `001` session (external-trackers Step 3 provenance), written once at creation |
| `cli/src/harness/validators/intent-evidence.mjs` (new) | `asdd check`: for `in_progress` slices whose `intent.md` has a `## Grounding` table, report malformed or unresolvable refs; severity `drift.intent_evidence` (`warn` default, `fail`) from `project.json`. Legacy intents without the table and closed slices are not reported (as SP-003 does for DRIFT-02) |
| `cli/src/harness/check-invariants.mjs` | Wire the validator |
| `cli/src/harness/commands.mjs` | `intake` entry |
| `cli/scaffold/config/project.schema.json` (+ copy) and `README.md` (+ copy) | `drift.intent_evidence: warn \| fail` |
| `cli/skills/external-trackers/SKILL.md` (+ copy) | Intake flow: read the Intent item with the tracker MCP → temp file → `asdd intake` → hand off to the slice's first phase; boundary notes that `asdd intake` (not the agent) writes `intent.md` |
| `package.json`, `README.md`, `cli/README.md` | Test entry and command rows |

## Rules

- Intent block: fenced ```` ```asdd-intent ````; `key: value` lines; required keys per `intent-format.md`; `intent_format` must be `1`; `slice_id` `^[a-z0-9][a-z0-9_-]*$`; `mode` `hotfix|lite|full`; `betting_state` must be `bet`; unknown keys are warnings.
- Required headings exactly as the format; `## Intent fitness` must contain `status: fit` (bullet `status` value `fit`).
- Grounding: header `| Kind | What | Evidence |`, ≥ 1 row, Kind `Reuse|Extend|New`, refs `REQ:<slice>/REQ-NNN`, `slice:<id>`, `path:<repo-path>[#…]`, `none` only on `New`; `Reuse`/`Extend` need a non-`none` ref. A `path:` that is absolute or has a `..` segment is invalid (error), never resolved.
- Stale (exists in the format, not in the repo): listed; intake stops unless `--accept-stale` (then the stale refs are written into `## Source`).
- Existing slice (`.harness/state/slices/<id>` or `.harness/specs/<id>/intent.md`): refused.

## New domain terms

None (Intent item and grounding come from tracker-binding).

## ADRs

None.
