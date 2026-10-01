# Harness Configuration

The portable kit owns the configuration validator and schema. A consuming
project owns .harness/config/project.json, which describes that project's
paths, bindings, commands, modules, and capabilities.

Validate the installed adapter from the project root:

    node .harness/scripts/check-project-config.mjs
    node .harness/scripts/check-invariants.mjs

`check-invariants.mjs` also checks that the skills catalog matches `.agents/skills/`. Regenerate that catalog with `node .harness/scripts/check-skills-index.mjs --write`. `project.json` records `commands.invariants` and `commands.verify_on_stop`. The Cursor stop hook is `.cursor/hooks.json`, which runs `node .harness/scripts/verify-on-stop.mjs`; it does not read `project.json`.

The installer creates a conservative adapter when the project does not have
one. Fill the project bindings before starting Discovery. Existing
project.json files are preserved by default.

Legacy per-slice manifests can be inspected without changing files:

    node scripts/harness-migrate.mjs

Apply a migration only after reviewing the dry run:

    node scripts/harness-migrate.mjs --write

The adapter is project state. The portable validator, schema, migration
utility, steering contracts, and agents remain maintained in
asdd-harness-kit.

