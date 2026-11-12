# Requirements: agents-spec

## Traceability
- Capability: [capability.md](./capability.md)
- Slice: agents-spec (full)

## EARS Requirements

### REQ-001 — No contradictions or leaks (P1)
**Universal:** No shipped agent shall instruct writing the generated manifest or registry, define an ADR format other than
the `documentation-and-adrs` skill's, state a pipeline ordinal in its description, allow parallel work beyond
`session-loop.md` (unique owners and disjoint `scope_paths`), or carry identifiers from another product.

### REQ-002 — One role per agent (P2)
**Universal:** The QA agent shall only audit (coverage gate); test authoring shall belong to the implementation agent's
TDD step and requirements review to the validation agent; the knowledge agent shall not custody state or re-trigger
agents; spike research shall belong to a read-only `asdd-spike-researcher` agent; only the implementation agent shall
declare `subagent_tools: true`.

### REQ-003 — Agent grammar (P3)
**Universal:** Every shipped agent shall have a description with `Use when` and `Do NOT use`; `metadata.tier`,
`metadata.workspace_mode`, `metadata.model_profile`; `capabilities` and `limits.max_turns`; a role charter with a
guarantees sentence, `**Operational Boundary:**`, `**Quarantine Boundary:**`, and `### Decision Rights`;
`## Pre-Flight Reading & Ground Truth` with Tier 1/2/3; `## Delegation & I/O Contract` with typed inputs, outputs, and a
verdict; a `Negative Space` section; the execution-point (`file:line`) and anti-hedging rules;
`## Convergence & Verification Gate` with a negative mutation check; `## Escalation Gate` with Context → Options →
Recommendation → Decision Needed; and, for authoring tiers, `**Author:**` / `**Model/Tool:**` provenance.

### REQ-004 — Projected tool envelopes
**Event-driven:** When `asdd install` wires the Claude Code, Cursor, or OpenCode runtime, the installer shall write each
agent file for that runtime from the canonical `capabilities` and `limits`: Claude Code `tools` (no `Edit` when edits are
denied, `Agent` only for an orchestrator) and `maxTurns`; Cursor `readonly: true` when `write_tools` is false; OpenCode
`permissions` (edit denied outside `write_paths`, `subagent` denied for non-orchestrators) and `steps`. Other runtimes
shall keep the link, and `asdd uninstall` shall remove the rendered files.

### REQ-005 — Size caps (P4)
**Universal:** No agent file shall exceed 20 KB or 500 lines; the Playwright runbook shall live in a `playwright-e2e`
module skill that passes `asdd kit skills-lint`.

### REQ-006 — The sensor (P5)
**Event-driven:** When `asdd kit agents-lint` runs on the kit or a project, the CLI shall exit 1 on any decidable
violation of REQ-002 (subagent tools outside an orchestrator, edit on an auditor or researcher), REQ-003, REQ-005, an
unresolved handoff agent or mounted skill, or a manifest-write instruction, and `npm test` shall run it.

## Priority Matrix
| ID | Priority | Status |
|----|----------|--------|
| REQ-001 | MUST | READY |
| REQ-002 | MUST | READY |
| REQ-003 | MUST | READY |
| REQ-004 | MUST | READY |
| REQ-005 | MUST | READY |
| REQ-006 | MUST | READY |

## Acceptance Criteria
### AC-001 — REQ-001
**Given** the shipped agents **When** the kit tests run **Then** none contains "write phase/gates", "manifest updates",
an ADR field list, an ordinal ("Fourth agent"), or `privy`/`buyin` identifiers; `asdd kit agents-lint` reports a manifest-write instruction in a fixture.
### AC-002 — REQ-002
**Given** an agent fixture with `subagent_tools: true` and tier `auditor`, or an auditor allowing `edit_file`
**When** `asdd kit agents-lint` runs **Then** it reports AL-103 / A-022; and the shipped QA agent has no test-generation or peer-review mode.
### AC-003 — REQ-003
**Given** an agent fixture missing any grammar slot **When** `asdd kit agents-lint` runs **Then** it reports the matching `A-*` rule.
### AC-004 — REQ-004
**Given** a project installed with `--runtime=claude,cursor,opencode` **When** install completes **Then**
`.claude/agents/asdd-validation-agent.md` has `tools:` without `Edit` and `Agent`, `.claude/agents/asdd-implementation-agent.md`
has `Agent`, `.opencode/agents/asdd-qa-agent.md` denies `edit` except its report and sessions, `.cursor/agents/asdd-spike-researcher.md`
has `readonly: true`, `.junie/agents/*` are links; uninstall removes the rendered files.
### AC-005 — REQ-005
**Given** the shipped agents **When** `asdd kit agents-lint` runs **Then** none exceeds the cap, and the new skill passes `asdd kit skills-lint`.
### AC-006 — REQ-006
**Given** the kit **When** `npm test` runs **Then** `asdd kit agents-lint` exits 0 and its tests pass.

## Out of Scope
- Projection for kimi, junie, devin, kiro; canary routing; path-scoped writes on Claude Code (its frontmatter has no path rules).
