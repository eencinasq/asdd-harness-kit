# Intent: harness-green

## Source

- **Pitch ID:** ad-hoc — Tech Lead request (2026-11-14): resolve the 19 `asdd check` FAILs left by the asdd-p0…p4 work.
- **Scope ID:** none — one lite slice.

## Problem

`asdd check` fails: 16 passing features changed after their verification (DRIFT-02); `npm test` stops at
`asdd kit vendor --check` (7 stale copies under `tools/*/src/harness/`) and `asdd kit self --check` (2 installed copies
behind `cli/`); `asdd kit guidance` reports the always-loaded steering 740 bytes over its 31962-byte budget, because the
skills index gained four `asdd-*` skills.

## Desired Outcome

`asdd check` and `npm test` pass without raising the budget: shorter skill descriptions, refreshed copies, and every
reopened feature verified again with its own command.

## Mapped files

`cli/skills/asdd-converge/SKILL.md`, `cli/skills/asdd-implement/SKILL.md`, `cli/skills/asdd-next/SKILL.md`,
`cli/skills/asdd-status/SKILL.md`, `cli/skills/codegraph/SKILL.md`, `cli/skills/external-trackers/SKILL.md`,
`.agents/skills/**`, `.harness/steering/skills.md`, `tools/spec-drift/src/harness/**`, `tools/knowledge/src/harness/**`,
`tools/jev-gate/src/harness/**`, files `asdd kit self` refreshes from `cli/`

## No-gos

No budget increase; no behaviour change in the harness libraries (copies only); no edits to the other slices' specs.
