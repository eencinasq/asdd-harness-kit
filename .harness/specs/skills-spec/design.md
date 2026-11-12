# Design: skills-spec

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `cli/skills/*/SKILL.md` (12) | Rewritten to the skill grammar (REQ-001, 002, 004, 005) |
| `cli/skills/{test-driven-development,documentation-and-adrs,create-mcp-app,shape-up}/references/*.md` | New references holding the tutorial content moved out (REQ-005) |
| `cli/skills/shape-up/references/pitch-template.md` | `pitch_id` and `betting_state` lines (the pitch output the gate checks) |
| `cli/modules/{http-api,web-ui}/skills/*/SKILL.md` (3) + new references | Same grammar; bilateral boundaries with TDD and each other |
| `cli/steering/{skills,README,controls,security-rules}.md` | Markers and escalation format; Prohibitions with HALT (REQ-003) |
| `cli/agents/asdd-design-agent.md` | ADR section cites `documentation-and-adrs` (REQ-002) |
| `cli/src/kit/skills-lint.mjs`, `cli/src/main.mjs` | New `asdd kit skills-lint` command (REQ-006) |
| `cli/test/skills-lint.test.mjs`, `cli/test/install.sh`, `package.json` | Sensor tests; scope-map owner assertion; sensor in `npm test` |
| `cli/README.md`, `cli/versions.json` | Command row; new reference files versioned |

## Domain Placement
- Owning domain: kit guidance (skills and steering the installer ships); no product code.
- Integration boundaries: the installer copies `cli/skills` and enabled module skills to `.agents/skills`; `asdd skills-index --write` builds the always-loaded index from their frontmatter.
- Documented exceptions: none.

## Domain Impact
- New terms added to Ubiquitous Language: none in a product domain. Kit vocabulary (tier, operational boundary, the four
  markers) is defined in `skills.md`.

## Architecture Decisions (ADRs)
- ADR-001: Every shipped skill is `leaf` — each runs its own commands; sequencing across skills belongs to the ASDD
  agents and is declared as handoffs. Strongest argument against: product-delivery and capability-discovery chain several
  steps and read like orchestrators; rejected because they invoke tools directly, which the orchestrator contract
  (SL-103) forbids. Consequence: no `## Dependencies` sections; SL-103 checks a leaf declares none.
- ADR-002: Core skills name only core skills; module skills may name core skills and their own module. Strongest
  argument against: SL-102 wants bilateral exclusion by name; rejected for core → module because a project may not
  install the module (SL-302 dangling). Core skills exclude module intents by description instead.
- ADR-003: Judgment skills write their output to files (`.harness/specs/<slice>/anti-patterns.md`, `glossary.md`,
  `canvas.yaml`; `docs/pitches/<pitch-id>/`) so the verification gate is a command. Strongest argument against: new
  artifacts the agents did not produce before; accepted, the agents already follow the skill body.
- ADR-004: The sensor treats every rule it can decide as an error (skill.spec §6: decidable → error), S-004 stays a
  warning. Strongest argument against: skill.spec lists S-016/S-017/S-020 as warnings; the decidable form (heading or
  label present) has no false positive in the kit, so it gates.
- ADR-005: The always-loaded budget is not raised; descriptions are shortened to fit. Consequence: the project budget
  margin is 45 bytes; the next description growth needs a budget decision by the Tech Lead.

## Sequence Diagram
```
Maintainer → npm test : run
npm test → asdd kit skills-lint : lint cli/skills + cli/modules/*/skills, cli/AGENTS.md + always steering
asdd kit skills-lint → Maintainer : FAIL <rule> <skill>: <message> | PASS
Agent → skills.md index : choose skill by description (Use when / Do NOT use)
Agent → SKILL.md : protocol → verification gate → escalation or handoff
```

## Component Map
```
cli/skills, cli/modules/*/skills ──(install)──> .agents/skills ──(skills-index)──> .harness/steering/skills.md
cli/src/kit/skills-lint.mjs ──reads──> skills, cli/AGENTS.md, cli/steering (inclusion: always)
```

## Risks and Mitigations
- Index growth breaks the steering budget: `asdd kit guidance` (budget) in `npm test`, including an installed project with a module.
- Description wrapping splits a skill name: SL-302 reports the broken name (seen during this slice).
- Lint rule by heading presence passes an empty section: the gates also require a command (S-006) and labels (S-016, S-017).

## Design Confidence Score
0.9
