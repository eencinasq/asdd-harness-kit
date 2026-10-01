# Shape Up + ASDD + Harness

This document defines an optional adapter for combining the framework-agnostic Shape Up pitch practice with the ASDD specification pipeline and Harness execution controls.

It is a portable framework guide. Product repositories keep their own product bindings, domain model, quality commands, and slice history under `.harness/`.

## Purpose

Shape Up helps a team decide which work deserves a fixed period of attention and how much uncertainty should be removed before that commitment. The `shape-up` skill owns that generic pitch. This document explains how this kit can convert the pitch into ASDD inputs and use Harness for execution, ownership, verification, and evidence.

The skill itself does not read `.harness/`, require ASDD terminology, or write framework-specific artifacts. The receiving agent or workflow owns the conversion into its own intake format.

The combined model is:

```text
Idea
  ↓
Pitch
  ↓
Bet / No bet / Park / Abandon
  ↓
ASDD Discovery → Spec → Validation → Domain → Design → Task Planning
  ↓
Harness Implementation → QA → Knowledge
  ↓
Ship / Re-shape / Park / Abandon
```

Shape Up terminology in this document follows the concepts described by Basecamp in [Shape Up](https://basecamp.com/shapeup): shaping, appetite, pitches, betting, scopes, hill charts, rabbit holes, cool-down, and circuit breakers.

## Responsibility by layer

| Concern | Shape Up | ASDD | Harness |
|---|---|---|---|
| Select work | Pitch and betting decision | Intent and capability context | Slice registry remains the execution index |
| Control uncertainty | Appetite, boundaries, rabbit holes | Discovery, Validation, Domain, Design | Blocked state and evidence expose unresolved work |
| Define the solution | Rough solution and no-gos | Requirements, contracts, design, domain rules | Feature tracker records the executable projection |
| Control time and scope | Fixed appetite, variable scope | Scope and acceptance boundaries | Tasks, dependencies, locks, and ownership |
| Demonstrate completion | Ship or make a closure decision | QA and Knowledge artifacts | Verification command and evidence are required for `passing` |

The layers complement each other. A pitch is a commitment proposal, an ASDD slice is the specification source of truth, and a Harness feature is the current execution projection.

When a product team uses the Product Delivery skill between shaping and ASDD, follow [`product-delivery/references/asdd-harness-handoff.md`](../.agents/skills/product-delivery/references/asdd-harness-handoff.md). Product Delivery creates the epic, stories, dependencies, technical proposal, and sprint context; the handoff then maps those artifacts into the ASDD slice and Harness feature tracker without changing the approved pitch silently.

## Lifecycle integration

### 1. Idea and intent

An idea can arrive from a user request, product discovery, incident, research result, or technical opportunity. Before detailed specification, capture enough context to decide whether the idea deserves shaping.

The initial intent should identify:

- the affected actor or customer;
- the problem or opportunity;
- the observable outcome;
- known constraints;
- evidence already available;
- open questions that could change the decision.

Do not turn an unvalidated idea into a capability or implementation task.

### 2. Pitch and shaping

The framework-agnostic `shape-up` skill creates the pitch. This kit's Discovery agent acts as an optional adapter when the pitch must enter ASDD. Shaping makes the proposal concrete enough for a betting decision while preserving uncertainty where the team does not have evidence.

Every pitch should contain:

1. **Problem and desired outcome** — why the work matters and what changes for a specific actor.
2. **Appetite** — the time the team is willing to spend. Appetite is a commitment boundary, not a detailed estimate.
3. **Rough solution** — the smallest coherent approach that could address the problem.
4. **Boundaries and no-gos** — decisions that prevent the work from expanding silently.
5. **Must-haves and nice-to-haves** — scope that can be cut in that order.
6. **Rabbit holes** — unknowns or technically open-ended areas that need validation.
7. **Scopes** — independently buildable and verifiable parts of the work.
8. **Success signals** — evidence that would show the intended outcome was reached.
9. **Assumptions and open questions** — explicitly marked for confirmation.

The pitch should describe a direction, not pretend to be the final technical design. Detailed contracts, domain rules, and measurable requirements belong to the corresponding ASDD phases.

### 3. Betting decision

The betting decision is a deliberate commitment gate before full ASDD execution. Record one of:

| Decision | Meaning | Next action |
|---|---|---|
| `bet` | The team commits the appetite and ownership | Create or activate the ASDD slice |
| `no_bet` | The proposal is not selected now | Preserve the decision and reason |
| `parked` | The proposal is valuable but blocked by timing, dependency, or evidence | Record the unblock condition |
| `abandoned` | The proposal is intentionally closed | Preserve the reason and relevant learning |
| `needs_shaping` | The pitch is not concrete enough to decide | Return to shaping and risk reduction |

The decision record should name the decision maker or group, date, appetite, expected team ownership, and any conditions for starting.

ASDD should not advance a slice to implementation solely because it has a pitch. The normal ASDD gates, project bindings, domain boundary checks, and quality gates still apply.

### 4. ASDD discovery and specification

Once a pitch is accepted, use it as input to the ASDD slice:

| Pitch content | ASDD destination |
|---|---|
| Problem and outcome | `intent.md` and `capability.md` |
| Actors and domain language | Discovery and Domain artifacts |
| Must-haves and nice-to-haves | Requirements and acceptance criteria |
| Rough solution | Design input, subject to validation |
| Rabbit holes | Validation risks, spikes, or explicit blockers |
| No-gos and boundaries | Out-of-scope and non-goals |
| Scopes | Design and `tasks.md` waves |
| Success signals | Requirements, verification, and QA evidence |

During Discovery, challenge the pitch assumptions. If the problem, actor, or intended outcome changes, update the pitch and require a new betting decision when the change affects appetite or scope.

### 5. Task Planning and Harness execution

Task Planning converts approved scopes into ASDD tasks and the Harness feature tracker. Each executable feature must have:

- an observable user-visible behavior;
- a verification command or procedure;
- dependencies and owner when applicable;
- a non-overlapping `scope_paths` when work is delegated;
- traceability to the relevant requirement or scope.

Harness locks preserve slice ownership. Harness evidence proves the result. A feature cannot become `passing` without the verification result and evidence required by the project contract.

New discovered tasks are allowed when they remain within the approved scope and appetite. A task that introduces a new capability, actor, domain rule, external contract, or material appetite change must return to shaping and betting.

### 6. Progress and scope control

The existing Harness statuses answer whether an executable feature has started or passed. Shape Up adds a useful uncertainty view for each scope:

```text
unknown → understood → implemented → verified
```

This can be represented as an optional hill status in progress records or scope maps. It must not replace Harness feature status or verification evidence.

At any point, the coordinator should be able to answer:

- Which scopes are still unknown?
- Which risks are active?
- Which must-haves are complete?
- Which nice-to-haves can be cut?
- Is the remaining work compatible with the appetite?
- What decision is needed if the appetite will not be met?

### 7. Cycle closure

At the end of the appetite, make an explicit closure decision:

1. ship the verified must-have outcome;
2. cut unfinished nice-to-have scope;
3. re-shape and re-bet materially changed work;
4. park work with a documented reason and restart condition;
5. abandon work when its value or feasibility no longer justifies commitment.

Do not extend a cycle silently. If a project does not fit the appetite, the team needs a scope decision, a new bet, or a recorded closure state.

The Knowledge phase captures the final outcome, decisions, rejected scope, and reusable learning. A cool-down period can be used for QA follow-up, cleanup, documentation, and preparation of the next betting batch.

## Appetite and scope rules

### Appetite is not an estimate

An estimate predicts how long a known set of work may take. Appetite states how much time the team is willing to invest. The pitch should choose an appetite appropriate to the project, such as one, two, four, or six weeks, without implying that every project must use a six-week cycle.

### Scope is variable within explicit boundaries

When work is larger than the appetite, reduce scope in this order:

1. remove nice-to-haves;
2. simplify workflows while preserving the core outcome;
3. split an independent scope into a later bet;
4. stop and re-shape when a must-have or a non-negotiable quality constraint cannot fit.

Security, compliance, safety, data integrity, and project quality gates remain hard constraints. They are not optional scope.

### Rabbit holes need evidence

A rabbit hole should become one of:

- a time-boxed validation spike;
- a known constraint in Design;
- a blocked item with an owner and unblock condition;
- an explicit reason to reject or re-shape the bet.

Do not hide a rabbit hole inside an implementation task or report false confidence.

## Full ASDD and ASDD-Lite

### Full ASDD

Use the complete flow for cross-cutting, new product capabilities, architectural decisions, or work involving multiple domains. The pitch precedes Discovery and feeds every later phase.

### ASDD-Lite

For small work, use:

```text
Pitch → Spec → Design → Tasks → Implementation → QA-Lite
```

The pitch can be short, but it still needs appetite, outcome, boundaries, and open risks. Escalate to full ASDD if the work introduces new domain concepts, multiple actors, new external contracts, or architectural decisions.

## Recommended adapter artifacts

The ASDD adapter can provide these optional fields and templates without changing the generic Shape Up skill or taking ownership of product history:

```text
.harness/specs/<slice>/pitch.md
.harness/specs/<slice>/betting-decision.md
.harness/specs/<slice>/scope-map.md
```

Suggested slice metadata:

```yaml
shape_up:
  enabled: true
  appetite: 2_weeks
  bet_status: bet
  must_haves: []
  nice_to_haves: []
  rabbit_holes: []
```

These fields should remain optional so projects can adopt the method incrementally. Product repositories own the concrete values and decisions.

## Adapter boundary

Keep the responsibilities separate:

| Artifact or action | Owner |
|---|---|
| Shape Up pitch and betting language | `shape-up` skill |
| Shareable pitch, user story, epic, task, or discovery intake conversion | `shape-up` conversion reference, when requested |
| ASDD intent, capability, requirements, and phase gates | ASDD Discovery and later agents |
| Harness slice state, locks, features, verification, and evidence | Harness workflow |

When a pitch is sent to the Discovery agent, pass it as source context or use the generic discovery-intake conversion. Discovery then owns the project-specific terminology, schemas, gates, and repository paths. A material change to the problem, outcome, appetite, or boundary should be surfaced as a re-shaping and re-betting decision.

## Adoption plan

### Wave 1: commitment clarity

- Add the `shape-up` skill.
- Require appetite, no-gos, must-haves, nice-to-haves, and rabbit holes for Shape Up pitches.
- Record `bet`, `no_bet`, `parked`, `abandoned`, or `needs_shaping`.

### Wave 2: execution visibility

- Add scope maps to Design or Task Planning.
- Track hill status as an optional progress signal.
- Allow discovered tasks inside approved boundaries.

### Wave 3: cycle closure

- Add circuit-breaker decisions to QA or Knowledge.
- Record cool-down outcomes and reusable learning.
- Re-shape and re-bet work that materially changes.

## Quality checklist

Before a pitch is ready for betting, confirm:

- the problem and actor are specific;
- the desired outcome is observable;
- the appetite is explicit;
- must-haves and nice-to-haves are separated;
- no-gos protect the boundary;
- rabbit holes have a validation or decision path;
- the rough solution is coherent but not falsely detailed;
- scopes can be built and verified independently where practical;
- assumptions and unanswered questions are visible;
- no security, compliance, safety, or quality constraint is hidden as optional scope;
- the proposed bet can be traced into an ASDD slice.
