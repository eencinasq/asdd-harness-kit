# Delivery Pipeline: From Idea to Implementation

## Overview

This document describes a portable delivery pipeline for taking a product idea from shaping through implementation with ASDD + Harness Engineering. Product repositories provide their own bindings, domain language, technology choices, and delivery system integrations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DELIVERY PIPELINE                                    │
│                                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │  Shape   │──▶│ Product  │──▶│  Sprint  │──▶│  GitHub  │──▶│   ASDD   │ │
│  │   Up     │   │ Delivery │   │  Plan    │   │  Issues  │   │ +Harness │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│    Pitch        Delivery Map     Sprint Plan    Issues        Slices      │
│    Bundle       Discovery        Tech Spec      Labels        Features    │
│                 Stories          Diagrams       Dependencies   Implementation│
│                 AF Refinement                                   QA         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Shape Up

**Skill:** `shape-up`
**Purpose:** Shape an idea into a bounded, bettable pitch.

### Process

```
Raw Idea → Set Boundaries → Find Elements → Address Risks → Write Pitch
```

### Output Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| **Pitch** | `docs/discovery/<name>.md` | Canonical pitch with problem, appetite, solution, rabbit holes, no-gos |
| **Pitch Bundle** | `docs/discovery/<name>-bundle.md` | Complete handoff package with all metadata |

### Pitch Structure

```markdown
# Pitch: <title>
## Status: needs_shaping | proposed | ready_for_bet | bet | no_bet | parked | abandoned
## Decision summary
## Problem
## Desired outcome
## Appetite
## Rough solution
## Must-haves / Nice-to-haves / No-gos
## Scopes
## Rabbit holes and risks
## Resolved assumptions
## Betting recommendation
```

### Key Principles

- **Fixed time, variable scope** — appetite is a commitment boundary, not an estimate
- **Rough but solved** — main elements connected, no over-specification
- **Bounded** — explicit no-gos and hard constraints

---

## Stage 2: Product Delivery

**Skill:** `product-delivery`
**Purpose:** Transform the pitch into validated, traceable delivery artifacts.

### Process

```
Pitch Bundle → Delivery Map → Discovery → HF Stories → AF Refinement → Tech Spec → Sprint Plan
```

### Output Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| **Delivery Map** | `docs/discovery/<name>-delivery-map.yaml` | Epic, stories, tasks, relations, dependencies |
| **Product Discovery** | `docs/discovery/<name>-discovery.md` | Problem framing, users, scope, constraints |
| **HF User Stories** | `docs/discovery/<name>-stories.md` | Human-First stories with acceptance criteria |
| **AF Refinement** | `docs/discovery/<name>-af-refinement.md` | Technical precision: contracts, UI states, test strategy |
| **Tech Spec** | `docs/discovery/<name>-tech-spec.md` | Architecture, contracts, diagrams, rollout |
| **Sprint Plan** | `docs/discovery/<name>-sprint-plan.md` | Phases, execution order, capacity, blockers |

### Delivery Map Structure

```yaml
source_pitch:
  id: PITCH-XXX
  status: bet
  appetite: 4 weeks

epic:
  id: EPIC-XXX
  title: <title>
  source_pitch_id: PITCH-XXX
  source_scope_ids: [SCOPE-001, ...]

stories:
  - id: US-001
    title: <title>
    actor: <actor>
    outcome: <outcome>
    classification: must_have | nice_to_have
    acceptance_criteria: [...]
    dependencies: [...]

tasks:
  - id: TASK-001
    title: <title>
    type: discovery | validation | design | implementation | verification | release
    completion_signal: <signal>
    dependencies: [...]

dependency_graph:
  nodes: [...]
  edges: [...]
  cycles: []
```

### Tech Spec Diagrams

| Diagram | Purpose |
|---------|---------|
| State Machine | Domain lifecycle states |
| System Context | High-level system boundaries |
| Sequence Diagram | Review workflow interactions |
| Flow Diagram | A key product workflow |
| Decision or Rule | A business rule or calculation when one exists |

---

## Stage 3: External Tracker (Optional)

**Purpose:** Mirror approved delivery artifacts into GitHub, Linear, Jira, or another tracker when the team needs an external planning view. The external tracker is a projection, not the ASDD or Harness source of truth.

### Mapping

| Delivery Artifact | External tracker item |
|-------------------|--------------|
| User Story | Issue with full story body |
| Task | Issue or checklist item |
| Dependencies | Referenced in issue bodies |
| Risks | Included in issue descriptions |

### Issue Template

```markdown
## User Story
As a **[role]**, I want to **[action]**, so that **[benefit]**.

## Acceptance Criteria
### AC-01 — [Scenario]
**Given** ...
**When** ...
**Then** ...

## Out of Scope
- ...

## Pending Definitions
- ...

## Traceability
- Source pitch ID: PITCH-XXX
- Parent epic ID: EPIC-XXX
- Source scope ID: SCOPE-XXX
- Direct story dependencies: ...
```

### Labels

| Label | Purpose |
|-------|---------|
| `story` | User stories |
| `task` | Implementation tasks |
| `<capability-slug>` | Epic or feature label |
| `must-have` | Must-have stories |
| `nice-to-have` | Nice-to-have stories |

---

## Stage 4: ASDD + Harness Implementation

**Purpose:** Execute the delivery artifacts using the ASDD pipeline with Harness Engineering.

### Mapping

| Delivery Artifact | ASDD + Harness |
|-------------------|----------------|
| Pitch | Slice manifest + spec |
| User Stories | Features in `.features.json` |
| Tasks | Tasks in `tasks.md` |
| Dependencies | Wave dependencies in `tasks.md` |
| Tech Spec | Design document |
| Sprint Plan | Execution phases |

### ASDD Phases

```
Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge
```

### Harness Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| **Slice Manifest** | `.harness/state/slices/<id>/manifest.json` | Phase machine, gates, confidence |
| **Features** | `.harness/features/<id>.features.json` | Session feature tracker |
| **Progress** | `.harness/progress/<id>.md` | Session record |
| **Locks** | `.harness/state/locks/<id>.lock` | Multi-agent mutex |
| **PROGRESS.md** | `.harness/PROGRESS.md` | Active slices index |

### Execution Flow

```
External tracker items (optional) → ASDD Discovery → Spec → Design → Task Planning
     ↓
Features.json → Implementation → QA → Knowledge
     ↓
Slice DONE → Lock Released → PROGRESS.md Updated
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  IDEA                                                                       │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SHAPE UP                                                             │   │
│  │ • Set boundaries (appetite)                                          │   │
│  │ • Find elements (rough solution)                                     │   │
│  │ • Address risks (rabbit holes)                                       │   │
│  │ • Write pitch                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│    │                                                                        │
│    ▼                                                                        │
│  PITCH (docs/discovery/<name>.md)                                          │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PRODUCT DELIVERY                                                     │   │
│  │ • Delivery Map (epic, stories, tasks, dependencies)                 │   │
│  │ • Product Discovery (problem, users, scope)                          │   │
│  │ • HF User Stories (acceptance criteria)                              │   │
│  │ • AF Refinement (contracts, UI states, test strategy)                │   │
│  │ • Tech Spec (architecture, diagrams, rollout)                        │   │
│  │ • Sprint Plan (phases, execution order)                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│    │                                                                        │
│    ▼                                                                        │
│  DELIVERY ARTIFACTS (docs/discovery/*)                                     │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ EXTERNAL TRACKER                                                        │   │
│  │ • User stories → Issues                                              │   │
│  │ • Tasks → Issues or checklist items                                   │   │
│  │ • Dependencies → Issue links                                         │   │
│  │ • Risks → Issue descriptions                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│    │                                                                        │
│    ▼                                                                        │
│  EXTERNAL TRACKER (optional external tracker references)                            │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ASDD + HARNESS                                                       │   │
│  │ • Discovery (slice manifest, spec)                                   │   │
│  │ • Design (domain model, architecture)                                 │   │
│  │ • Task Planning (tasks.md, features.json)                             │   │
│  │ • Implementation (TDD, codegraph)                                    │   │
│  │ • QA (spec coverage, verification)                                   │   │
│  │ • Knowledge (completion, archive)                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│    │                                                                        │
│    ▼                                                                        │
│  IMPLEMENTATION (apps/, libs/)                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Traceability Matrix

| Stage | Artifact | Traces To |
|-------|----------|-----------|
| Shape Up | Pitch | Raw idea |
| Product Delivery | Delivery Map | Pitch |
| Product Discovery | Discovery | Pitch, Delivery Map |
| HF Stories | Stories | Delivery Map, Discovery |
| AF Refinement | AF Details | Stories |
| Tech Spec | Tech Spec | AF Refinement, Stories |
| Sprint Plan | Sprint Plan | Tech Spec, Delivery Map |
| External tracker | Issues or tickets | Stories, Tasks |
| ASDD | Slice Manifest | Pitch, Issues |
| ASDD | Features | Stories, Tasks |
| ASDD | Tasks | Delivery Map, Sprint Plan |

---

## Tools & Skills

| Tool | Purpose |
|------|---------|
| `shape-up` skill | Pitch creation and review |
| `product-delivery` skill | Delivery artifacts and sprint planning |
| Tracker integration | External issue or ticket creation |
| Codegraph MCP | Code intelligence and impact analysis |
| ASDD agents | Discovery, spec, validation, domain, design, implementation, QA |
| Harness | Session loop, locks, features, progress tracking |

---

## Key Principles

| Principle | Description |
|-----------|-------------|
| **Fixed time, variable scope** | Appetite is a boundary, not an estimate |
| **Ambiguity is a defect** | Clarify, label assumptions, or mark `PENDING_DEFINITION` |
| **Contracts over assumptions** | Every stage consumes and produces explicit artifacts |
| **AI is a pilot, not an authority** | Humans retain approval authority |
| **Evidence before completion** | Never fabricate details |
| **Traceability** | Downstream artifacts link to upstream requirements |
| **Stable identity** | Every epic, story, task has an identifier |
| **Explicit graph** | Dependencies control execution order |

---

## Example: Generic Capability

| Stage | Artifact | Path |
|-------|----------|------|
| Shape Up | Pitch | `docs/discovery/<capability-slug>.md` |
| Product Delivery | Delivery Map | `docs/discovery/<capability-slug>-delivery-map.yaml` |
| Product Delivery | Discovery | `docs/discovery/<capability-slug>-discovery.md` |
| Product Delivery | Stories | `docs/discovery/<capability-slug>-stories.md` |
| Product Delivery | AF Refinement | `docs/discovery/<capability-slug>-af-refinement.md` |
| Product Delivery | Tech Spec | `docs/discovery/<capability-slug>-tech-spec.md` |
| Product Delivery | Sprint Plan | `docs/discovery/<capability-slug>-sprint-plan.md` |
| External tracker | Issues or tickets | Optional links carrying the same source IDs |
| ASDD | Slice | `.harness/state/slices/<slice-id>/manifest.json` |

---

## Summary

The pipeline transforms an idea into implementation through four connected stages and one optional integration:

1. **Shape Up** — shapes the idea into a bounded, bettable pitch
2. **Product Delivery** — transforms the pitch into delivery artifacts
3. **External tracker (optional)** — mirrors approved stories and tasks when the team uses one
4. **ASDD + Harness** — turns the approved package into a governed slice and executes it with full traceability

The Product Delivery → ASDD + Harness handoff is defined in [`product-delivery/references/asdd-harness-handoff.md`](../.agents/skills/product-delivery/references/asdd-harness-handoff.md). The handoff preserves the chain `TASK → REQ → story → source scope → epic → pitch`, gives each ASDD phase a clear input, and makes Harness the source of truth for live implementation status and evidence.

Each stage produces explicit artifacts that trace back to the source pitch, ensuring no requirement is lost or silently changed.
