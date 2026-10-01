# Shape Up Input to Delivery Artifacts

This guide defines the primary input contract for `product-delivery`. It consumes a Shape Up pitch artifact bundle and converts it into an epic, user stories, tasks, relationships, dependencies, and a sprint plan.

The pitch is the source of product intent and commitment boundaries. The delivery artifacts add structure and precision; they must not silently change the pitch. This workflow does not shape raw ideas.

## Required input bundle

The minimum input is a canonical Shape Up pitch with:

- a stable pitch identifier or explicit `PENDING_DEFINITION`;
- a betting status;
- an appetite;
- a problem and desired outcome;
- boundaries, must-haves, nice-to-haves, and no-gos;
- scopes or an explicit statement that scopes are pending;
- assumptions, open questions, and rabbit holes.

Optional companion artifacts include:

- `betting-decision.md`;
- `scope-map.md`;
- risk or rabbit-hole notes;
- a shareable pitch conversion.

If the canonical pitch is absent, send the input to the Shape Up shaping workflow. A raw request is not sufficient input for this skill.

## Required source fields

Read the pitch and preserve these fields:

| Pitch field | Delivery use |
|---|---|
| Pitch id or title | `source_pitch_id` and artifact provenance |
| Betting state | Approval and readiness status |
| Appetite | Time boundary for planning |
| Problem | Discovery problem statement |
| Desired outcome | Epic outcome and story value |
| Rough solution | Proposal context, never a verified requirement |
| Must-haves | Required stories and acceptance boundaries |
| Nice-to-haves | Optional stories, lower priority, cuttable |
| No-gos | Out of scope and negative constraints |
| Scopes | Epic children and story candidates |
| Rabbit holes | Discovery or validation tasks and risks |
| Assumptions/open questions | Pending definitions and blockers |

If a required source field is missing, preserve `PENDING_DEFINITION` rather than filling it from intuition. The resulting delivery map must be `PARTIALLY_READY` or `BLOCKED` until the missing field is resolved.

## Conversion pipeline

```text
Shape Up pitch artifact bundle
  ↓
Pitch intake
  ↓
Delivery map
  ├── Epic
  ├── User stories
  ├── Discovery / validation tasks
  ├── Implementation tasks
  ├── Relationships
  └── Dependency graph
  ↓
Product discovery and validation
  ↓
Technical specification
  ↓
Sprint plan
```

The delivery map is the bridge between the pitch and the downstream artifacts. Create it before detailed story writing. It is required for the primary Shape Up workflow even when the pitch has only one scope, because it preserves source identity and readiness state.

## Epic conversion

Create one parent epic for the pitched outcome. The epic may be a real epic or an explicit container for a single scope, but it must preserve the pitch relationship. It must include:

- `id`, `title`, and `source_pitch_id`;
- the problem and desired outcome;
- appetite and current betting state;
- must-have and nice-to-have scope;
- source scope identifiers;
- out-of-scope boundaries;
- success signals;
- open questions and risks.

Use an explicit `epic` even when it acts as a container for one story if the workflow requires a stable parent for traceability. Mark it `container: true` rather than inventing extra scope.

## User story conversion

Create a user story when one specific actor has one coherent outcome. Each story must link to:

- its parent epic;
- one source pitch;
- one source scope where available;
- its must-have or nice-to-have classification;
- its direct dependencies;
- its acceptance boundary;
- unresolved definitions.

Use the HF format for business clarity:

```text
As a <specific actor>,
I want <observable outcome>,
so that <value>.
```

The story may contain proposed acceptance criteria, but unsupported criteria must be marked `PENDING_DEFINITION` or `PROPOSED — VALIDATION REQUIRED`.

Do not combine several actors, independent outcomes, or unrelated workflows in one story. Split them and relate them to the same epic when appropriate.

## Task conversion

Create a task for one concrete action. Valid task categories include:

- `discovery` — investigate a product or domain question;
- `validation` — reduce a rabbit hole or test an assumption;
- `design` — define a solution boundary or contract;
- `implementation` — build an approved behavior;
- `verification` — prove a story or requirement;
- `release` — perform an approved delivery action.

Every task needs:

- `id` and title;
- source story, scope, or rabbit hole;
- one owner or `PENDING_DEFINITION`;
- completion signal;
- dependencies, when real;
- status and blockers.

Do not create implementation tasks from rough solution language until discovery and technical validation support them.

## Relationships versus dependencies

Use a typed relation when two artifacts are connected conceptually. Use a dependency only when execution order or correctness requires it.

For relations, `from` is the artifact making the reference and `to` is the referenced artifact. Use `from` as the blocked item and `to` as the prerequisite for dependencies.

### Relation types

| Type | Meaning | Blocks execution? |
|---|---|---:|
| `derived_from` | Artifact was created from another artifact | No |
| `contains` | Parent epic contains story or story contains task | No |
| `refines` | Artifact adds precision to another | No |
| `validates` | Work checks an assumption or outcome | Usually no |
| `duplicates` | Two artifacts overlap and need resolution | No |
| `relates_to` | Meaningful connection without a stronger type | No |
| `depends_on` | Target must be ready before source can proceed | Yes |
| `blocks` | Target cannot proceed until source is resolved | Yes |
| `conflicts_with` | Both cannot be accepted together without a decision | Decision required |

Store `depends_on` and `blocks` in the dependency graph as directed edges. Store the other relations separately so conceptual relationships do not artificially serialize the plan.

## Dependency rules

1. Dependencies must point from a blocked item to the item it needs.
2. Every dependency must include a reason.
3. A dependency must identify the blocking artifact, not a vague team or system.
4. Detect cycles before Sprint Planning.
5. Do not use priority as a substitute for dependency.
6. Do not infer a dependency only because two stories touch the same area.
7. Mark external or unknown dependencies `PENDING_DEFINITION`.
8. A nice-to-have must not block a must-have unless the pitch explicitly requires that relationship.

Example:

```yaml
dependencies:
  - from: US-002
    to: US-001
    reason: "The confirmation flow requires the account enrollment behavior."

relations:
  - from: US-001
    to: PITCH-001
    type: derived_from
  - from: EPIC-001
    to: US-001
    type: contains
  - from: TASK-003
    to: RISK-001
    type: validates
```

## Priority and appetite

Use the pitch's scope classification:

- must-have stories are required for the pitched outcome;
- nice-to-have stories are candidates for cutting;
- out-of-scope items are excluded;
- unresolved rabbit holes become validation work or blockers.

Do not claim that all stories fit the appetite until scope, dependencies, and capacity are validated. The appetite is a boundary; it is not permission to fabricate estimates. A `bet` status permits downstream planning; it does not bypass validation or capacity checks.

## Delivery map quality gate

Before handing work to technical specification or sprint planning, verify:

- one parent epic or an explicit reason no epic is needed;
- every story has a source pitch and epic relationship;
- every story has one actor and one coherent outcome;
- every task has a source story, scope, or risk;
- every must-have scope has representation;
- nice-to-haves are labeled and cuttable;
- no-gos are not converted into work;
- relations use a known type;
- dependencies have direction and reason;
- no dependency cycle exists;
- no orphan story or task exists;
- open questions and blockers remain visible;
- no approved pitch meaning changed silently.
- the source pitch is present and its betting state permits the requested downstream action;
- raw ideas have not been converted directly into delivery artifacts.

If the gate fails, use `PARTIALLY_READY` or `BLOCKED` and list the finding.
