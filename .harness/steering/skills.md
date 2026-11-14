---
inclusion: always
classification: hybrid-index
---

# ASDD skills index (kit)

Initial catalog for folders under `.agents/skills/`. Each folder exposes only its name and description here. The skill body stays in `SKILL.md` until the matching task starts.

## Disclosure (invariants)

- **SKL-01.** Read this file to choose a skill. This is the initial index.
- **SKL-02.** When you start the task that matches a description, `Read` `.agents/skills/<name>/SKILL.md` and follow that file.
- **SKL-03.** Until that task starts, do not `Read` that `SKILL.md` or its `references/`.
- **SKL-04.** Do not copy a skill body into this index. After adding or editing a skill folder, regenerate the catalog with `asdd skills-index --write`.
- **SKL-05.** Authoring a skill? Follow `.agents/skills/capability-authoring/SKILL.md` (profile: `references/skill-profile.md`).
- **SKL-06.** A skill that is not yet copied into `.agents/skills/` is not part of this index.

## Enforcement

`asdd skills-index` FAILs on index↔folder drift (SKL-04); `check-skill-profile` / `check-skill-fleet` lint bundles. SKL-02/SKL-03 are reviewer-enforced disclosure economy.

## Markers and escalation

Mark what the source does not settle; never write it as fact or drop a marker before its decision:
`PENDING_DEFINITION` (a required fact is missing; its gate stays open), `ASSUMPTION — CONFIRMATION REQUIRED` (inferred,
not stated), `PROPOSED — VALIDATION REQUIRED` (agent-generated; a human decides, `decided_by`), `DERIVED` (carried into
a derived artifact with its `source_*` ID).

When a precondition, step, or invariant cannot be met: HALT — no guessing, blind retries, or workarounds — and report
Context → Options → Recommendation → Decision Needed. A `redirect` to the producer of a missing input is recovery,
not escalation. Sensors: `asdd check` (index), `asdd kit skills-lint` (skill grammar).

<!-- skills-index:start -->
| Name | Description |
| --- | --- |
| `anti-pattern-detection` | Judges drafted capabilities and requirements against eight specification anti-patterns and scores them. Use when a capability or requirements draft reaches its anti-pattern gate. Do NOT use for extracting terms — use domain-language-extraction; or for judging code — use codebase-audit. |
| `asdd-converge` | Marks a verified feature passing. Use when its verification passed. Do NOT use to code — use asdd-implement. |
| `asdd-implement` | Codes the in_progress feature. Use when a TASK starts. Do NOT use to pick one — use asdd-next. |
| `asdd-next` | Picks the next ready feature. Use when choosing what to build. Do NOT use to code — use asdd-implement. |
| `asdd-status` | Reports slice and pipeline health. Use when asking what is in progress. Do NOT use to edit — use asdd-next. |
| `business-model-canvas` | Turns a Business Model Canvas or Lean Canvas into proposed capabilities and personas traced to their blocks. Use when a Discovery intent supplies a BMC or Lean Canvas. Do NOT use for free-text vocabulary — use domain-language-extraction; or for existing code — use capability-discovery. |
| `capability-authoring` | Authors and verifies .agents/skills/<name>/ skill bundles from a capability specification. Use when creating or auditing a skill bundle. Do NOT use for agent profiles, AGENTS.md, _prompt.md, or fleet-wide linting. |
| `capability-discovery` | Discovers the capabilities an existing codebase implements as draft capability files. Use when onboarding a repository that has code but no specs. Do NOT use for a business canvas — use business-model-canvas; or for judging code against requirements — use codebase-audit. |
| `codebase-audit` | Judges the code in the audit's churn hotspots against its requirements with file and line evidence. Use when running a scheduled audit or after `asdd audit` reports hotspots. Do NOT use for judging requirement text — use anti-pattern-detection; or for exploring code — use codegraph. |
| `codegraph` | Answers code-structure questions (flows, callers, impact). Use when exploring code. Do NOT use to judge code — use codebase-audit. |
| `create-mcp-app` | Builds an MCP App: an MCP tool linked to a bundled HTML view. Use when asked to create or scaffold an MCP App or add a UI to an MCP tool. Do NOT use for an MCP server without UI or a regular web page; or for testing app logic — use test-driven-development. |
| `documentation-and-adrs` | Records architectural decisions as ADRs (the kit's ADR format) and updates the docs a change needs. Use when making an architectural decision or changing public behavior. Do NOT use for designing an API contract (the http-api module); or for tests — use test-driven-development. |
| `domain-language-extraction` | Extracts the domain terms a business text states into a source-cited glossary. Use when an intent, pitch, or requirements draft needs its vocabulary pinned. Do NOT use for judging requirement quality — use anti-pattern-detection; or for a canvas — use business-model-canvas. |
| `external-trackers` | Syncs a tracker pitch with the ASDD handoff. Use when an intent cites a tracker item. Do NOT use to split pitches — use product-delivery. |
| `product-delivery` | Splits a bet Shape Up pitch into scopes and writes one intent.md (one ASDD slice) per scope. Use when a pitch has been bet and building starts in a repository with .harness/. Do NOT use for shaping or betting — use shape-up; or for tracker reads and syncs — use external-trackers. |
| `shape-up` | Shapes ideas into Shape Up pitches, reviews them, and records the bet. Use when writing or reviewing a pitch or coaching shaping. Do NOT use for splitting a bet pitch into intents in a .harness/ repository — use product-delivery; or for trackers — use external-trackers. |
| `test-driven-development` | Drives a code change with a failing test first and records the run as feature evidence. Use when changing code whose behavior a test can pin. Do NOT use for live-browser checks, UI craft, or API contract design (module skills); or for configuration or docs. |
<!-- skills-index:end -->
