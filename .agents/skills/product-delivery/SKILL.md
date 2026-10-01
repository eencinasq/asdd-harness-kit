---
name: product-delivery
description: >-
  Consumes Shape Up pitch artifacts and transforms them into validated,
  traceable delivery artifacts across epics, user stories, technical
  specifications, tasks, relationships, dependencies, and sprint planning.
---

# Product Delivery Skill

**Version:** 1.2
**Status:** Production Draft

## Purpose
Consume a shaped Shape Up proposal and transform it into validated, traceable, implementation-ready delivery artifacts. Shaping and betting remain upstream responsibilities of the `shape-up` workflow.

## Progressive Disclosure & Agents

| Component | Path | Purpose |
|---|---|---|
| Product Discovery Agent | [`agents/product-discovery.md`](./agents/product-discovery.md) | Problem framing, user needs, scope, discovery validation gate |
| User Story Architect Agent | [`agents/user-story-architect.md`](./agents/user-story-architect.md) | Hybrid Human-First (HF) & Agent-First (AF) user stories |
| Tech Spec Generator Agent | [`agents/tech-spec-generator.md`](./agents/tech-spec-generator.md) | Implementation architecture, contracts, task decomposition |
| Technical Diagrams Guide | [`references/technical-diagrams.md`](./references/technical-diagrams.md) | Mermaid, C4, use-case, and sequence diagram standards |
| Sprint Planning Agent | [`agents/sprint-planning.md`](./agents/sprint-planning.md) | Capacity, sequencing, dependency mapping, sprint plan gate |
| Shape Up Input Guide | [`references/shape-up-input.md`](./references/shape-up-input.md) | Pitch intake, conversion, traceability, relations, and dependencies |
| ASDD + Harness Handoff | [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md) | Converts ready delivery artifacts into an ASDD slice and Harness execution projection |
| Discovery Schema | [`contracts/discovery.schema.yaml`](./contracts/discovery.schema.yaml) | Discovery artifact schema contract |
| User Story Schema | [`contracts/user-story.schema.yaml`](./contracts/user-story.schema.yaml) | HF/AF user story schema contract |
| Delivery Map Schema | [`contracts/delivery-map.schema.yaml`](./contracts/delivery-map.schema.yaml) | Epic, stories, tasks, relations, and dependency graph |
| Tech Spec Schema | [`contracts/tech-spec.schema.yaml`](./contracts/tech-spec.schema.yaml) | Tech spec schema contract |
| Sprint Plan Schema | [`contracts/sprint-plan.schema.yaml`](./contracts/sprint-plan.schema.yaml) | Sprint plan schema contract |
| End-to-End Example | [`examples/end-to-end-example.md`](./examples/end-to-end-example.md) | Complete artifact pipeline example |

## Canonical Flow
```text
Shape Up Pitch Artifact Bundle
  ↓
Pitch Intake and Delivery Map
  ↓
Product Discovery / Epic
  ↓
Validated Product Requirements and Story Candidates
  ↓
Human-First User Story
  ↓
Agent-First Refinement
  ↓
Technical Specification
  ↓
Implementation Tasks and Dependency Graph
  ↓
Sprint Plan
  ↓
ASDD + Harness Handoff (when implementation is requested)
  ↓
ASDD Discovery → Spec → Validation → Domain → Design → Task Planning
  ↓
Harness Implementation → QA → Knowledge
```

## Core Principles
- **Ambiguity is a defect:** clarify, label assumptions, or mark `PENDING_DEFINITION`.
- **Contracts over assumptions:** every stage consumes and produces explicit artifacts.
- **AI is a pilot, not an authority:** humans retain approval authority.
- **Evidence before completion:** never fabricate details.
- **Traceability:** downstream artifacts must link to upstream requirements.
- **Stable identity:** every epic, story, task, relation, and dependency has an identifier.
- **Explicit graph:** dependencies control execution order; other relations explain meaning without blocking work.

## Shape Up pitch input

The primary input is a Shape Up pitch artifact bundle. Read [`references/shape-up-input.md`](./references/shape-up-input.md) for the input contract. If the `shape-up` skill is installed, also read its conversion reference at [`../shape-up/references/conversions.md`](../shape-up/references/conversions.md).

The bundle may contain:

- the canonical pitch;
- a betting decision;
- a scope map;
- rabbit-hole or risk notes;
- a shareable pitch or approved pitch conversion.

If only a raw idea, user request, or unshaped problem is supplied, stop delivery conversion and route it to `shape-up` first. Do not create an epic or user story from an unshaped input.

The pitch remains the upstream source artifact. This skill converts it into delivery artifacts without silently changing its meaning:

```text
pitch → delivery map → discovery → epic → user stories → tasks → sprint plan
```

The conversion must preserve:

- pitch identity and status;
- appetite as a time boundary, never as a fabricated estimate;
- must-haves, nice-to-haves, and no-gos;
- source scopes and rabbit holes;
- assumptions, open questions, and unresolved decisions;
- traceability from every derived artifact back to its source.

When a pitch has multiple independent scopes, create one parent epic and derive stories from those scopes. When a scope has one coherent actor outcome, create one user story. When a scope contains several independent outcomes, split it into related stories under the epic. Create tasks only for concrete discovery, validation, design, or implementation actions.

The pitch status controls delivery readiness:

- `needs_shaping` or `proposed`: create a partial delivery map and report blockers;
- `ready_for_bet`: prepare delivery artifacts but do not claim commitment;
- `bet`: allow downstream planning when all delivery gates pass;
- `no_bet`, `parked`, or `abandoned`: preserve the map for traceability and stop implementation planning.

The conversion output should include a delivery map with:

- one epic or explicit epic container;
- user stories linked to the epic and source scope;
- tasks linked to stories or discovery risks;
- typed relationships;
- dependency edges and a cycle check;
- orphan, ambiguous, and blocked items;
- pending definitions and approval state.

## Global States
`PITCH_INTAKE → DELIVERY_MAP → DISCOVERY → DISCOVERY_VALIDATION → HF_AUTHORING → HF_VALIDATION → AF_REFINEMENT → TECH_SPEC → TECH_VALIDATION → SPRINT_PLANNING → SPRINT_VALIDATION → READY_FOR_DELIVERY`

When the project has Harness installed and implementation is requested, `READY_FOR_DELIVERY` hands off to the ASDD pipeline. Read [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md) and continue with the project’s ASDD agents. Product Delivery artifacts remain traceability inputs; `.harness/` phase artifacts and the Harness feature tracker own implementation state.

`PITCH_INTAKE` and `DELIVERY_MAP` are the required entry stages for the primary Shape Up workflow. A raw idea must first go through `shape-up`.

Critical gaps block transitions.

## Artifact Metadata
```yaml
artifact:
  type: string
  id: string
  version: string
  status: draft | validated | approved | partially_ready | blocked
  source_artifacts: []
  assumptions: []
  pending_definitions: []
  risks: []
  dependencies: []
  relations: []
  source_pitch_id: string
  parent_id: string
  source_scope_id: string
```

## Finding Types
`BLOCKER`, `CRITICAL_RISK`, `RISK`, `AMBIGUITY`, `DEPENDENCY`, `ASSUMPTION`, `PENDING_DEFINITION`, `PROPOSAL`.

## Orchestration Rules
- Require a Shape Up pitch artifact bundle as the primary input.
- If no pitch exists: route the request to `shape-up` and stop delivery conversion.
- Validate the pitch artifact, betting state, appetite, boundaries, source scopes, and risk notes before producing delivery artifacts.
- Run the Shape Up input conversion before Product Discovery and produce a delivery map.
- Create the parent epic from the pitched outcome and preserve its appetite and scope boundaries.
- Derive stories from source scopes, keeping one actor outcome per story; do not create stories without a source scope or explicit proposal.
- Derive tasks from approved stories, discovery risks, or explicit validation needs; never turn every sentence into a task.
- Add dependencies only when one item cannot start or finish correctly before another; record other connections as typed relations.
- Detect dependency cycles, orphan stories, orphan tasks, and stories without acceptance boundaries before Sprint Planning.
- If the pitch problem or outcome is unclear: run Product Discovery, but preserve the unresolved pitch field and mark the delivery map `PARTIALLY_READY` or `BLOCKED`.
- If requirements exist but no HF User Story: run User Story Architect in HF mode.
- If HF exists and technical precision is needed: run AF refinement.
- If implementation design is needed: run Tech Spec Generator.
- If implementation-ready work must be scheduled: run Sprint Planning.
- Do not skip critical stages.
- Do not force unnecessary stages when a validated artifact already exists.
- Do not mutate an approved pitch silently. If conversion changes the problem, outcome, appetite, or boundaries, flag `RE-SHAPING_REQUIRED`.
- When implementation is requested and `.harness/` exists, execute the ASDD + Harness handoff after `READY_FOR_DELIVERY`; do not jump directly from a story or sprint plan to code.
- Preserve the full traceability chain `TASK → REQ → story → source scope → epic → pitch` in the handoff artifacts and feature tracker.
- At implementation closure, route scope changes and cycle decisions through the handoff reference and the Shape Up closure rules.

## Anti-Hallucination Rules
Never fabricate:
- requirements
- business rules
- architecture
- APIs
- database schemas
- UI specifications
- assets
- estimates
- team capacity
- approvals

Use:
- `PENDING_DEFINITION`
- `ASSUMPTION — CONFIRMATION REQUIRED`
- `PROPOSED — VALIDATION REQUIRED`
- `INSUFFICIENT_INFORMATION`

## Internal Validation
Before major output:
1. Analyze context.
2. Extract evidence.
3. Map evidence to the relevant contract.
4. Detect gaps.
5. Check traceability.
6. Validate consistency.
7. Generate output.
8. Run the quality gate.

For the required Shape Up input, also:

9. Validate source-to-artifact traceability.
10. Validate relation types and dependency direction.
11. Detect cycles and orphan artifacts.
12. Confirm that must-have stories are represented and nice-to-have stories are labeled.
13. Confirm that no implementation planning proceeds from a non-bet state.

Do not expose private chain-of-thought. Provide concise conclusions, assumptions, risks, open questions, and next steps when useful.

## Final Rule
A downstream agent may increase precision but must not silently change the meaning of an approved upstream requirement. If meaning or scope changes: flag it, identify the source artifact, request validation, and update only after confirmation.
