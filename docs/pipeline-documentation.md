# Delivery Pipeline: From Idea to Implementation

## Overview

This document describes a portable delivery pipeline for taking a product idea from shaping through implementation with ASDD + Harness Engineering. **Jev System One is required on Shape Up and Product Delivery only** ([jev-integration.md](jev-integration.md)); harness ASDD does not call Jev. Product repositories provide their own bindings, domain language, technology choices, `JEV_API_KEY` (for those skills), and tracker integrations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DELIVERY PIPELINE                                    │
│                                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │  Shape   │──▶│ Product  │──▶│  Work  │──▶│  GitHub  │──▶│   ASDD   │ │
│  │   Up     │   │ Delivery │   │  Plan    │   │  Issues  │   │ +Harness │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│    Pitch        Delivery Map     Work  Plan    Issues        Slices      │
│    Bundle       Discovery        Tech  Spec      Labels        Features    │
│                 Stories          Diagrams       Dependencies   Implementation│
│                 AF Refinement                                   QA         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Shape Up

**Skill:** `shape-up`  
**Jev (required via MCP):** `jev_shape_up_gates` before betting (shell fallback: `jev-gates.mjs`).

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
**Jev (required via MCP):** `jev_ears_gate` + `jev_slice_choice` before freezing REQ-* (shell fallback: `jev-gates.mjs`).

### Process

```
Pitch Bundle → Delivery Map → Discovery → HF Stories → AF Refinement → Tech Spec → Work Plan
```

### Output Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| **Delivery Map** | `docs/discovery/<name>-delivery-map.yaml` | Epic, stories, tasks, relations, dependencies |
| **Product Discovery** | `docs/discovery/<name>-discovery.md` | Problem framing, users, scope, constraints |
| **HF User Stories** | `docs/discovery/<name>-stories.md` | Human-First stories with acceptance criteria |
| **AF Refinement** | `docs/discovery/<name>-af-refinement.md` | Technical precision: contracts, UI states, test strategy |
| **Tech Spec** | `docs/discovery/<name>-tech-spec.md` | Architecture, contracts, diagrams, rollout |
| **Work Plan** | `docs/discovery/<name>-work-plan.md` | Phases, execution order, capacity, blockers |

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
| Work Plan | Execution phases |

### ASDD Phases

Full path:
```
Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge
```

**Lite-first:** slices start in `lite` mode by default (`init-slice.mjs <id>`), which runs
`Spec → Design → Tasks → Implementation → QA-Lite` with four artifacts (`spec.md`, `design.md`,
`tasks.md`, `features.json`). `full` is opt-in (`init-slice.mjs <id> --full`) for work known
upfront to be cross-cutting or architectural. Mode is derived from session events, never
hand-edited — see `.harness/steering/asdd-lite.md`.

### Escalating a lite slice (evidence-based)

Growth in a lite slice is detected from sessions, not judged:

| Trigger | Evidence | Consequence |
|---------|----------|-------------|
| E2 serial violation | >1 `in_progress` feature | FAIL invariants (lite is serial) |
| E1 scope spread | scope spans ≥2 top-level modules | signal → blocks `DONE` |
| E3 domain growth | >1 new domain term on checkpoints | signal → blocks `DONE` |
| E4 dissent | any dissent session | signal → blocks `DONE` |
| E5 implementation blockage | `phase_blocked` in implementation | signal → blocks `DONE` |

While signals are open they appear as WARNs in `check-invariants` and in
`harness-status.mjs`; completing `qa`/`knowledge` with signals open is a FAIL and
`sync-state` will not derive `DONE`. Resolve with:

```bash
node .harness/scripts/escalate-slice.mjs <slice-id> --reasons "E1-scope-spread,E4-dissent"
```

then backfill `capability.md` + `requirements.md` from `spec.md` and continue at the
Validation phase of the full path.

### Harness Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| **Active spec** | `.harness/specs/<slice>/intent.md` | Product intent. Lite uses `spec.md` in the same directory |
| **Slice Manifest** | `.harness/state/slices/<id>/manifest.json` | Phase machine, gates, confidence |
| **Features** | `.harness/features/<id>.features.json` | Session feature tracker, `scope_paths`, verification, evidence |
| **Sessions** | `.harness/state/slices/<id>/sessions/*.json` | Append-only log; `sync-state.mjs` generates the manifest |
| **PROGRESS.md** | `.harness/PROGRESS.md` | Active slices index |
| **Controls** | `.harness/steering/controls.md` | Which guide or sensor wins when they disagree |
| **Quality gates** | `.harness/steering/quality-gates.md` | EARS acceptance criteria for phase gates. Numeric cutoffs live only here |
| **Gate binding** | `.harness/steering/quality-gates.project.md` | Full-suite command, failure log, active domain findings |
| **Jev** | `.harness/steering/jev.md` | Skill-scoped System One (shape-up / product-delivery MCP); client `jev-client.mjs` |
| **Knowledge index** | `.harness/knowledge/*.jsonl` | Generated graph+chunk projection of specs/state/features (`sync-knowledge.mjs`); queried via the `knowledge` MCP server. Regenerable — never SoT. Growth path: [architecture/knowledge-scaling.md](architecture/knowledge-scaling.md) |

How these fit together: [asdd-and-harness-engineering.md](asdd-and-harness-engineering.md).

### Execution Flow

```
External tracker items (optional) → ASDD Discovery → Spec → Design → Task Planning
     ↓
Features.json → Implementation (mapped files only) → QA → Knowledge
     ↓
Invariants pass → Evidence recorded → PROGRESS.md matches the slice manifest
```

Implementation edits only the files mapped to the active spec. A skill body is read when that task starts, not from the skills index. On **Cursor**, `.cursor/hooks.json` runs the command gate on `beforeShellExecution` (fail-closed) and `verify-on-stop.mjs` on `stop`; on **Claude Code**, `.claude/settings.json` wires the same two scripts to `PreToolUse` (Bash) and `Stop`. Both stop-gates run `check-invariants.mjs --live` (Jev is not required for this gate) — a failing check is returned as the next prompt. Other runtimes are advisory (see the enforcement matrix in [asdd-harness-portability.md](asdd-harness-portability.md)). CI reruns these exact suites (`.github/workflows/harness-invariants.yml`):
unit tests (`node --test`), installer smoke test, lifecycle e2e with negative invariant cases, project config and skills index, and a `sync-state` + invariants pass.

The full suite in `quality-gates.project.md` runs before a new spec enters Task Planning.

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
│  │ • Set boundaries (appetite) + Jev score                             │   │
│  │ • Find elements (rough solution)                                     │   │
│  │ • Address risks (rabbit holes) + Jev noul                            │   │
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
│  │ • HF User Stories + Jev EARS noul + slice choice                     │   │
│  │ • AF Refinement (contracts, UI states, test strategy)                │   │
│  │ • Tech Spec (architecture, diagrams, rollout)                        │   │
│  │ • Work Plan (phases, execution order)                              │   │
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
│  │ • Discovery → Design → Task Planning                                 │   │
│  │ • Implementation (TDD, command gate, mapped files)                   │   │
│  │ • Invariants + gold-plating noul + evidence                          │   │
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
| Work Plan | Work Plan | Tech Spec, Delivery Map |
| External tracker | Issues or tickets | Stories, Tasks |
| ASDD | Slice Manifest | Pitch, Issues |
| ASDD | Features | Stories, Tasks |
| ASDD | Tasks | Delivery Map, Work Plan |

---

## Tools & Skills

| Tool | Purpose |
|------|---------|
| `shape-up` skill | Pitch creation; required Jev MCP appetite + rabbit hole |
| `product-delivery` skill | Delivery artifacts; required Jev MCP EARS + slice class |
| Tracker integration | Optional issue projection; collisions via `scope_paths` |
| Codegraph MCP | Code intelligence |
| Knowledge MCP (`knowledge-server.mjs`) | Process intelligence — `knowledge_search` / `knowledge_trace` / `knowledge_slice` / `knowledge_status` over the generated index |
| `sync-knowledge.mjs` | Rebuild `.harness/knowledge/` (nodes/edges/chunks); `--embed` adds vectors via `KNOWLEDGE_EMBEDDINGS_URL` |
| ASDD agents | Discovery through QA |
| Harness | Sessions, features, invariants, pattern command gate |
| `init-slice.mjs [--full]` | Scaffold a slice; lite by default |
| `escalate-slice.mjs` | Lite → escalated transition on detected evidence |
| Jev | MCP `jev-gate` + `jev-client.mjs` / `jev-gates.mjs` (shape-up / product-delivery only) |
| Skills index | `.harness/steering/skills.md` — name and description until the task starts |
| Verify-on-Stop | `check-invariants.mjs --live` at session end (Cursor + Claude Code hooks) |

---

## Key Principles

| Principle | Description |
|-----------|-------------|
| **Fixed time, variable scope** | Appetite is a boundary, not an estimate |
| **Lite-first, escalate on evidence** | Slices start lite; growth measured from sessions forces escalation — ceremony is earned, not presumed |
| **Ambiguity is a defect** | Clarify, label assumptions, or mark `PENDING_DEFINITION` |
| **Contracts over assumptions** | Every stage consumes and produces explicit artifacts |
| **AI is a pilot, not an authority** | Humans retain approval authority |
| **Evidence before completion** | `passing` requires a recorded verification result. A summary is not evidence |
| **Invariants before handoff** | `check-invariants.mjs` exits 0. The same failure three times updates the guide or sensor that missed it |
| **Mapped files only** | Product edits stay inside the active spec. Unrequested refactors stay out |
| **One numeric gate** | CCS and coverage cutoffs come from `quality-gates.md` |
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
| Product Delivery | Work Plan | `docs/discovery/<capability-slug>-work-plan.md` |
| External tracker | Issues or tickets | Optional links carrying the same source IDs |
| ASDD | Slice | `.harness/state/slices/<slice-id>/manifest.json` |

---

## Summary

The pipeline transforms an idea into implementation through four stages. **Jev is required on Shape Up and Product Delivery only** ([jev-integration.md](jev-integration.md)).

1. **Shape Up** — bounded pitch; Jev MCP appetite + rabbit-hole before betting
2. **Product Delivery** — delivery artifacts; Jev MCP EARS + slice choice
3. **External tracker (optional)** — mirrors approved stories; file collisions are Harness `scope_paths`, not Jev
4. **ASDD + Harness** — governed slice, TDD, pattern command gate, evidence (no Jev)

The Product Delivery → ASDD + Harness handoff is defined in [`product-delivery/references/asdd-harness-handoff.md`](../.agents/skills/product-delivery/references/asdd-harness-handoff.md). The handoff preserves the chain `TASK → REQ → story → source scope → epic → pitch`, gives each ASDD phase a clear input, and makes Harness the source of truth for live implementation status and evidence. Guides, sensors, and session close are described in [asdd-and-harness-engineering.md](asdd-and-harness-engineering.md).

Each stage produces explicit artifacts that trace back to the source pitch, ensuring no requirement is lost or silently changed.
