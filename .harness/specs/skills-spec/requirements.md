# Requirements: skills-spec

## Traceability
- Capability: [capability.md](./capability.md)
- Slice: skills-spec (lite, escalated for E1-scope-spread: TASK-006 edits `package.json`)
- Source: [spec.md](./spec.md) — REQ IDs unchanged

## EARS Requirements

### REQ-001 — Proof and halt in every skill (P1)
**Universal:** Every skill the CLI ships shall have a `Use when` trigger in its description, no absolute user path, a
`## Verification Gate` of runnable checks that includes a negative check, and a `## Escalation Gate` that halts and
escalates as Context → Options → Recommendation → Decision Needed.

### REQ-002 — One route, one owner (P2)
**Universal:** Every skill description shall end with a `Do NOT use` boundary that names a sibling only when the sibling
ships in the same fleet (core names core; a module skill names core or its own module), and every skill shall declare
`metadata.tier`. The TDD description shall exclude live-browser checks and UI craft; `product-delivery` shall be the only
skill that defines the scope map in a repository with `.harness/`; `external-trackers` shall be the only skill that reads
or writes a tracker; the design agent shall cite `documentation-and-adrs` for the ADR format.

### REQ-003 — Rules live in steering (P2)
**Universal:** The always-loaded `skills.md` shall define the markers `PENDING_DEFINITION`,
`ASSUMPTION — CONFIRMATION REQUIRED`, `PROPOSED — VALIDATION REQUIRED`, `DERIVED`, and the escalation format; the
`codegraph` skill shall cite the codegraph-first rule of `AGENTS.md`; `README.md`, `controls.md`, and `security-rules.md`
shall each have a Prohibitions section with a HALT directive.

### REQ-004 — Contracts and steps (P3)
**Universal:** Every skill shall state `**Operational boundary:**` in its overview, a `## Input / Output Contract` with
named, typed inputs and outputs, a `## Execution Protocol` whose every step has Action, Target, and Assertion, and a
`## Handoff & Convergence` section.

### REQ-005 — Size caps (P4)
**Universal:** No `SKILL.md` shall exceed 500 lines, 20 KB inline, or 15 KB when its folder has other files.

### REQ-006 — The sensor (P5)
**Event-driven:** When `asdd kit skills-lint` runs on the kit or a project, the CLI shall exit 1 on any decidable
violation of REQ-001, REQ-002 (boundary, tier, dangling or cross-fleet name), REQ-004, REQ-005, a duplicated 5-line
block, a handoff cycle, an always-loaded rule over 24 KB, or frontmatter in the root `AGENTS.md`, and `npm test` shall run it.

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
**Given** a skill without a verification gate, an escalation gate, or a trigger, or with `/tmp/...` in its body
**When** `asdd kit skills-lint` runs
**Then** it reports S-006, S-009, S-003, or S-011 for that skill and exits 1

### AC-002 — REQ-002
**Given** a skill with no `Do NOT use`, no tier, or a core description naming a module skill
**When** `asdd kit skills-lint` runs
**Then** it reports SL-101, SL-103, or SL-302; and the shipped TDD, product-delivery, external-trackers, and design-agent
texts carry the boundaries and owners REQ-002 names

### AC-003 — REQ-003
**Given** the shipped steering
**When** the kit test suite runs
**Then** `skills.md` holds the four markers and `Decision Needed`, the three files hold Prohibitions with HALT, and the
`codegraph` skill cites `AGENTS.md`

### AC-004 — REQ-004
**Given** a skill with a step lacking an Assertion, an untyped contract, no handoff, or no boundary
**When** `asdd kit skills-lint` runs
**Then** it reports S-017, SL-303, SL-302, or S-020

### AC-005 — REQ-005
**Given** a packaged `SKILL.md` over 15 KB
**When** `asdd kit skills-lint` runs
**Then** it reports S-008; the same file inline (under 20 KB) passes

### AC-006 — REQ-006
**Given** the kit repository
**When** `npm test` runs
**Then** `asdd kit skills-lint` exits 0 and the sensor tests pass

## Out of Scope
- The canary routing suite, trigger-similarity scoring (SL-102/104/106), producer–consumer contract matching (SL-304/307).
