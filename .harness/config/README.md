# Harness Configuration

The portable kit owns the configuration validator and schema. A consuming
project owns .harness/config/project.json, which describes that project's
paths, bindings, commands, modules, and capabilities.

Validate the installed adapter from the project root:

    asdd check-config
    asdd check

`drift.contract` sets the severity of the feature contract check `DRIFT-06` (`scope_paths` on every feature, `evidence` on `passing` features): `warn` (default) or `fail`.

`drift.intent_evidence` sets the severity of `INTENT-EVIDENCE`: in an in-progress slice whose `intent.md` has a `## Grounding` table (imported with `asdd intake`), every `REQ:`, `slice:`, and `path:` ref must still resolve. `warn` (default) or `fail`.

`stop.mode` is `fail_closed` (default) or `advisory`. Advisory still runs Verify-on-Stop `asdd check --live` and records learning signals, but does not block the session (`HARNESS_STOP_MODE` overrides). `capabilities.spec_as_source: true` opts into the experimental `asdd spec-source` inventory (not default SoT).

`tracker` (optional) names where the PO/PM keeps pitches and Intent items; `asdd check-config` FAILs on an unknown `type` or a missing field. Intent item format: [`intent-format.md`](../../.agents/skills/external-trackers/references/intent-format.md).

| `type` | `project` | Also | `pitch` | `intent` |
|---|---|---|---|---|
| `jira` | project key (`PROD`) | `site` (`acme.atlassian.net`) | `{ "issue_type": "Epic" }` | `{ "issue_type": "Story" }` and/or `{ "label": "asdd-intent" }` |
| `linear` | team key (`ENG`) | — | `{ "container": "project" }`, or `{ "container": "issue", "label": "pitch" }` | `{ "label": "asdd-intent" }` |
| `github` | `owner/repo` | — | `{ "label": "asdd:pitch" }` | `{ "label": "asdd:intent" }` |

Optional sibling file `portfolio.json`: `{ "repos": [{ "id": "…", "path": "…" }] }` for `asdd portfolio` (read-only multi-repo summary).

`asdd check` also checks that the skills catalog matches `.agents/skills/`. Regenerate that catalog with `asdd skills-index --write`. `project.json` records `commands.invariants` and `commands.verify_on_stop`. The Cursor / Claude stop hooks run `asdd verify`; they honor `stop.mode` / `HARNESS_STOP_MODE`.

The installer creates a conservative adapter when the project does not have
one. Fill the project bindings before starting Discovery. Existing
project.json files are preserved by default.

If harness state is incomplete or inconsistent (missing sessions, specs, or
features), repair it and regenerate derived files:

    asdd repair --dry-run
    asdd repair

The adapter is project state. The portable validator, schema, repair
utility, steering contracts, and agents remain maintained in
asdd-harness-kit.
