# Intent: kit-hygiene

> Source: ad-hoc (cooldown). Requested by the kit maintainer after an honest review of the kit (2026-10-28). Not part of a Shape Up pitch.

## Source

- **Pitch ID:** ad-hoc
- **Scope ID:** — kit-hygiene
- **Scope class:** `must_have`

---

## Problem

Agents installed by the kit read guidance that contradicts what the harness actually does, and nothing stops that guidance from growing or drifting:

- Agent and steering files still tell agents to hold a slice lock, write `.harness/progress/<slice>.md`, update a `PROGRESS.md` row by hand, maintain `dependency-graph.json`, and mark slices `PARKED`/`ABANDONED` through a checkpoint — none of which the scripts support.
- Eight agent prompts define their own numeric cutoffs (for example `≥ 0.95` to skip a phase, `0.75`/`0.90` for refactors, "raise your target to 0.90" rules), although `controls.md` precedence 2 says cutoffs live only in `quality-gates.md`.
- The command safety gate is named `jev-command-gate.mjs` although it never calls Jev, which misleads every reader of the hooks and docs.
- The steering loaded on every session (`inclusion: always` files plus `AGENTS.md`) is about 36.6 KB, and no sensor notices when it grows.

## Desired Outcome

An agent in an installed project reads only guidance the harness enforces or supports, and the kit's test suite fails when that stops being true: a stale reference, an agent-defined cutoff, a misleading script name, or always-loaded steering over budget.

## Appetite

One cooldown cycle (about one week of maintainer time).

## Must-have outcomes

- **MH-01:** The agent guidance shipped by the kit shall reference no lock protocol, no `.harness/progress/` records, no hand-edited `PROGRESS.md` rows, and no artifact that no script or agent produces.
- **MH-02:** When a session records a slice as `PARKED` or `ABANDONED`, the generated manifest and registry shall show that status, and a later session shall be able to resume it.
- **MH-03:** The agent prompts shipped by the kit shall contain no numeric cutoff; they shall cite the `QG-*` rule that holds it.
- **MH-04:** The command gate shall run as `command-gate.mjs`, and an existing project whose hooks still call `jev-command-gate.mjs` shall keep the same verdicts after upgrading.
- **MH-05:** If the always-loaded steering exceeds the budget recorded in the kit's `quality-gates.project.md`, then `npm test` shall fail.
- **MH-06:** The kit's own domain model (`docs/architecture/domain-model.md`) shall never be copied into a project; a project shall receive the empty stub.

## Nice-to-haves (~)

- Shrink the always-loaded steering below today's size.

## No-gos

- Do not change the gate model in `quality-gates.md` (the confidence-score gates stay).
- Do not move Jev out of the core here; that is the `jev-module` slice.
- Do not edit skills' internal scoring rubrics (anti-pattern score method, domain-language levels); only agent prompts lose cutoffs.

## Rabbit holes

- Renaming a hook script can break installed projects whose `.cursor/hooks.json` or `.claude/settings.json` still name the old file. Patch: keep a shim at the old path.
- `PROGRESS.md` is seeded into every project and described as "human-curated or generated". Patch: decide one owner (generated from the registry) instead of deleting it.

## Actors

- Coding agent in an installed project: reads steering and agent prompts each session.
- Kit maintainer: runs `npm test` before a release.
- Adopting engineer: upgrades the kit in an existing project.

## Depends on

- none

## Open questions

- none blocking (see capability.md assumptions)
