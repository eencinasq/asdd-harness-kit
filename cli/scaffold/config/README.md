# Harness Configuration

The portable kit owns the configuration validator and schema. A consuming
project owns .harness/config/project.json, which describes that project's
paths, bindings, commands, modules, and capabilities.

Validate the installed adapter from the project root:

    asdd check-config
    asdd check

`drift.contract` sets the severity of the feature contract check `DRIFT-06` (`scope_paths` on every feature, `evidence` on `passing` features): `warn` (default) or `fail`.

`asdd check` also checks that the skills catalog matches `.agents/skills/`. Regenerate that catalog with `asdd skills-index --write`. `project.json` records `commands.invariants` and `commands.verify_on_stop`. The Cursor stop hook is `.cursor/hooks.json`, which runs `asdd verify`; it does not read `project.json`.

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
