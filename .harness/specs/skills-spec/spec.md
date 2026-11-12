# skills-spec — Spec (lite)

## Intent

Bring every skill the CLI ships (`cli/skills/*`, `cli/modules/*/skills/*`) to the skill grammar of `skill.spec` (rules
`S-*`) and the fleet rules of `skill.linter` (`SL-*`), tighten the always-loaded steering against `rule.spec` (`R-*`),
and add the sensor that keeps them there. The review that found the gaps: no skill had an escalation gate, 9 had no
verification gate, 0 had a negative trigger boundary, tier, typed I/O contract, or handoff section; `create-mcp-app`
used absolute paths; `shape-up` exceeded the packaged cap; TDD, browser testing, and frontend collided on "fix a bug".

Phases: P1 = REQ-001; P2 = REQ-002, REQ-003; P3 = REQ-004; P4 = REQ-005; P5 = REQ-006.

Out of scope: renaming or merging skills, moving `create-mcp-app` into a module, the model-in-the-loop canary suite of
`skill.linter` (it needs model calls; it does not fit CI), changing gate numbers in `quality-gates.md`.

## Requirements

- **REQ-001 (P1).** Every skill shall have a `## Verification Gate` of machine-executable checks that includes a negative check (no change outside its operational boundary), a `## Escalation Gate` that halts and escalates as Context → Options → Recommendation → Decision Needed, a `Use when` trigger in its description, and no absolute user path.
- **REQ-002 (P2).** Every skill description shall end with a negative boundary (`Do NOT use …`) that names the sibling skill when one exists in the fleet the skill ships with (a core skill names only core skills; a module skill may name core skills and skills of its own module); every skill shall declare `metadata.tier`; the TDD trigger shall no longer cover browser debugging or UI craft; the scope map shall have one owner (`product-delivery`) inside a repository with `.harness/`; tracker writes shall have one owner (`external-trackers`); the ADR format shall have one authority (`documentation-and-adrs`), which the design agent cites.
- **REQ-003 (P2).** The provenance markers (`PENDING_DEFINITION`, `ASSUMPTION — CONFIRMATION REQUIRED`, `PROPOSED — VALIDATION REQUIRED`, `DERIVED`) and the escalation format shall be defined once in always-loaded steering (`skills.md`) and cited by skills; the `codegraph` skill shall cite the codegraph-first rule of `AGENTS.md` instead of restating it; the always-loaded steering files without prohibitions or a halt directive (`README.md`, `skills.md`, `security-rules.md`, `controls.md`) shall state them.
- **REQ-004 (P3).** Every skill shall state its operational boundary in its overview, and have a `## Input / Output Contract` with named, typed inputs and outputs (format or path), a `## Execution Protocol` whose steps each carry an Action, a Target, and an Assertion, and a `## Handoff & Convergence` section (`None (terminal)` when it hands off nowhere).
- **REQ-005 (P4).** No `SKILL.md` shall exceed its cap (inline ≤ 20 KB, packaged ≤ 15 KB, ≤ 500 lines); generic engineering advice (test pyramid, comment style, README layout, design-system craft, DevTools tutorials) shall live in the skill's `references/`, loaded on demand.
- **REQ-006 (P5).** `asdd kit skills-lint [dir]` shall check, over the core and module skills (kit) or `.agents/skills` (project): the decidable `S-*` rules with the fleet promotions (S-014/015/021/022 as errors), `SL-101`, `SL-103`, `SL-105`, `SL-301`, `SL-302`, `SL-303`, and `R-004`/`R-005` over `AGENTS.md` and the always-loaded steering; it shall exit 1 on any error, and `npm test` shall run it on the kit.

## Design

- One skill grammar, from `skill.spec` §2: frontmatter (`description` = capability + `Use when` + `Do NOT use`; `metadata.tier`), overview with `**Operational boundary:**`, `## Preconditions` where the skill needs a binary, MCP server, or input it cannot produce, `## Input / Output Contract`, `## Execution Protocol` (`### Step N:` with `- **Action:**`, `- **Target:**`, `- **Assertion:**`), `## Verification Gate`, `## Escalation Gate`, `## Handoff & Convergence`.
- Every skill is `leaf`: each one runs its own commands (no skill only delegates), so none meets the orchestrator contract (`SL-103`: steps that only delegate, `## Dependencies` with two or more leaves). Sequencing across skills is done by the ASDD agents and stated as handoffs.
- Judgment skills (anti-pattern detection, canvas, glossary, shaping) write their output to a file under `.harness/specs/<slice-id>/` (or the pitch directory), so the gate can check it with `test -s` / `grep`; the human decision stays a recorded `decided_by`.
- Core skills name only core skills in their descriptions and handoffs (a project may not install a module); module skills name core siblings, which always exist.
- The sensor is pure Node (no model calls), reuses the frontmatter parsing of `check-skills-index.mjs`, and is a kit command next to `kit guidance`.
- Sources edit `cli/`; `asdd kit self` refreshes the kit's copies; `asdd skills-index --write` regenerates the index.
