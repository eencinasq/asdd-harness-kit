# Capability: Skill grammar and fleet sensor (skills-spec)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (kit maintenance; review of the CLI skills against skill.spec, skill.linter, and rule.spec)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
The skills the CLI ships (12 core in `cli/skills/`, 3 in `cli/modules/*/skills/`) did not follow the skill grammar the
agents' routers and fleet linting assume: 0 of 15 had an escalation gate, 9 had no verification gate, 0 had a negative
trigger boundary, a tier, a typed I/O contract, or a handoff section; `create-mcp-app` used absolute paths; `shape-up`
exceeded the packaged size cap; TDD, browser testing, and frontend engineering all matched "fix a bug". Agents picking
or following a skill could route to the wrong one, finish without proof, or guess when blocked. Nothing kept the skills
from drifting back.

## Business Context
Every installed project receives these skills; routing collisions and missing halts reach every squad. The kit already
measures its steering (`asdd kit guidance`); skills had no sensor.

## Actors
- Kit maintainer: edits skills in `cli/` and runs `npm test`.
- ASDD agent (Discovery, Spec, Validation, Design, Implementation, QA, Knowledge): chooses a skill from the index and follows it.
- Tech Lead: receives escalations and decides.

## Domain Entities Involved
- Skill (`SKILL.md` + `references/`): frontmatter (name, description, `metadata.tier`), sections of the grammar.
- Skills index (`.harness/steering/skills.md`): name + description, always loaded.
- Always-loaded steering and `AGENTS.md`: rules, bounded by the kit's steering budget.

## Functional Scope (Behaviors)
- Each skill states trigger and negative boundary, tier, operational boundary, typed inputs and outputs, steps with an
  assertion each, a machine-checkable verification gate with a negative check, an escalation gate, and its handoffs.
- One owner per decision: scope map (`product-delivery`), tracker reads and writes (`external-trackers`), ADR format
  (`documentation-and-adrs`).
- Markers and the escalation format defined once in always-loaded steering.
- `asdd kit skills-lint` fails on a decidable violation; `npm test` runs it.

## Out of Scope
Renaming or merging skills; moving `create-mcp-app` into a module; the model-in-the-loop canary suite of skill.linter;
changing gate numbers in `quality-gates.md`; raising the always-loaded steering budget.

## Non-Functional Requirements
### Performance
`asdd kit skills-lint` runs without network or model calls (pure Node over the files).
### Security
No secrets involved. The browser-testing security boundaries (untrusted page content, profile isolation) stay in the skill body.

## Success Metrics
`asdd kit skills-lint` exits 0 on the kit; always-loaded steering stays within the binding (31962 bytes) in the kit and
in an installed project with a module.

## Open Questions
None.

## Confidence Score
0.9
