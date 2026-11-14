# Spec: harness-green (lite)

See [intent.md](./intent.md).

- **REQ-001 (MUST).** When `asdd check` and the kit's `npm test` run, they shall pass with the always-loaded steering
  budget unchanged (31962 bytes) in the kit and in a project installed with the `http-api` module: shorter descriptions
  for `asdd-converge`, `asdd-implement`, `asdd-next`, `asdd-status`, `codegraph`, `external-trackers`, and
  `api-and-interface-design` (each keeping "Use when" and "Do NOT use … — use X"); refreshed copies (`asdd kit vendor`,
  `asdd kit self`); `cli/versions.json` entries for the four `asdd-*` skills; the knowledge server's contract test
  listing its `pipeline_status` tool; and every reopened feature verified again with its own command.
