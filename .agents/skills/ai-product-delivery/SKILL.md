---
name: ai-product-delivery
description: >-
  Transforms ambiguous product requests into validated, traceable,
  implementation-ready delivery artifacts across discovery, user stories,
  technical specifications, and sprint planning.
---

# AI Product Delivery Skill

**Version:** 1.0  
**Status:** Production Draft

## Purpose
Transform ambiguous product requests into validated, traceable, implementation-ready delivery artifacts.

## Progressive Disclosure & Agents

| Component | Path | Purpose |
|---|---|---|
| Product Discovery Agent | [`agents/product-discovery.md`](./agents/product-discovery.md) | Problem framing, user needs, scope, discovery validation gate |
| User Story Architect Agent | [`agents/user-story-architect.md`](./agents/user-story-architect.md) | Hybrid Human-First (HF) & Agent-First (AF) user stories |
| Tech Spec Generator Agent | [`agents/tech-spec-generator.md`](./agents/tech-spec-generator.md) | Implementation architecture, contracts, task decomposition |
| Sprint Planning Agent | [`agents/sprint-planning.md`](./agents/sprint-planning.md) | Capacity, sequencing, dependency mapping, sprint plan gate |
| Discovery Schema | [`contracts/discovery.schema.yaml`](./contracts/discovery.schema.yaml) | Discovery artifact schema contract |
| User Story Schema | [`contracts/user-story.schema.yaml`](./contracts/user-story.schema.yaml) | HF/AF user story schema contract |
| Tech Spec Schema | [`contracts/tech-spec.schema.yaml`](./contracts/tech-spec.schema.yaml) | Tech spec schema contract |
| Sprint Plan Schema | [`contracts/sprint-plan.schema.yaml`](./contracts/sprint-plan.schema.yaml) | Sprint plan schema contract |
| End-to-End Example | [`examples/end-to-end-example.md`](./examples/end-to-end-example.md) | Complete artifact pipeline example |

## Canonical Flow
```text
Raw Idea
  ↓
Product Discovery
  ↓
Validated Product Requirements
  ↓
Human-First User Story
  ↓
Agent-First Refinement
  ↓
Technical Specification
  ↓
Implementation Tasks
  ↓
Sprint Plan
```

## Core Principles
- **Ambiguity is a defect:** clarify, label assumptions, or mark `PENDING_DEFINITION`.
- **Contracts over assumptions:** every stage consumes and produces explicit artifacts.
- **AI is a pilot, not an authority:** humans retain approval authority.
- **Evidence before completion:** never fabricate details.
- **Traceability:** downstream artifacts must link to upstream requirements.

## Global States
`DISCOVERY → DISCOVERY_VALIDATION → HF_AUTHORING → HF_VALIDATION → AF_REFINEMENT → TECH_SPEC → TECH_VALIDATION → SPRINT_PLANNING → SPRINT_VALIDATION → READY_FOR_DELIVERY`

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
```

## Finding Types
`BLOCKER`, `CRITICAL_RISK`, `RISK`, `AMBIGUITY`, `DEPENDENCY`, `ASSUMPTION`, `PENDING_DEFINITION`, `PROPOSAL`.

## Orchestration Rules
- If the problem is unclear: run Product Discovery.
- If requirements exist but no HF User Story: run User Story Architect in HF mode.
- If HF exists and technical precision is needed: run AF refinement.
- If implementation design is needed: run Tech Spec Generator.
- If implementation-ready work must be scheduled: run Sprint Planning.
- Do not skip critical stages.
- Do not force unnecessary stages when a validated artifact already exists.

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

Do not expose private chain-of-thought. Provide concise conclusions, assumptions, risks, open questions, and next steps when useful.

## Final Rule
A downstream agent may increase precision but must not silently change the meaning of an approved upstream requirement. If meaning or scope changes: flag it, identify the source artifact, request validation, and update only after confirmation.
