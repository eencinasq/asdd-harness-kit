# Product Delivery → ASDD + Harness Handoff

This reference defines how an implementation-ready Product Delivery package becomes an ASDD slice and then an executable Harness session. Use it when the consuming project has `.harness/` and the request includes implementation, coding, or execution.

Product Delivery remains the source for product decomposition. ASDD remains the source for requirements, domain decisions, architecture, and implementation tasks. Harness remains the source for execution ownership, verification evidence, and session state.

## Handoff entry gate

Create an ASDD slice only when all of the following are true:

- the source pitch has a stable ID and `bet` status;
- the appetite, boundaries, must-haves, nice-to-haves, and no-gos are recorded;
- the delivery map has one parent epic and traceable stories or explicit pending definitions;
- dependencies, cycles, orphan artifacts, and blockers have been checked;
- the Product Delivery package is `READY` or the project has explicitly accepted a documented partial handoff;
- the project bindings and quality gates under `.harness/steering/` are available.

`needs_shaping`, `proposed`, `no_bet`, `parked`, and `abandoned` pitches do not enter implementation planning. Preserve them for product traceability and return to Shape Up when appropriate.

## Canonical artifact mapping

The source artifacts stay where the project stores them. The ASDD slice records links and stable IDs; it does not silently duplicate or rewrite the source pitch.

| Product Delivery artifact | ASDD destination | Harness projection | Authority |
|---|---|---|---|
| Canonical pitch and betting decision | `intent.md` source context and slice metadata | Slice status and phase | Shape Up |
| Delivery map | Discovery input and traceability section | Dependency context | Product Delivery |
| Product discovery | Discovery evidence | None | Product Delivery, then ASDD Discovery for project binding |
| HF stories and acceptance criteria | Spec input | Feature behavior and `req_ids` | Product Delivery, then ASDD Spec for EARS requirements |
| AF refinement | Validation and Design input | Verification context | Product Delivery, then ASDD Validation/Design |
| Technical specification | Design input and architecture evidence | Task context | Product Delivery proposal, then ASDD Design decision |
| Sprint plan | Task planning context | Optional execution order | Product Delivery recommendation; Harness owns live status |
| ASDD `tasks.md` | Implementation plan | One feature per `TASK-*` | ASDD Task Planning |
| `.harness/features/<slice>.features.json` | Execution projection | Owner, scope, status, verification, evidence | Harness |

Product Delivery artifacts may propose architecture, contracts, or scheduling. ASDD agents must label those decisions as `PROPOSED`, validate them against project steering, and record the final decision in the ASDD artifact that owns it.

## Recommended slice layout

Use the project binding for the concrete specification directory. A typical slice is:

```text
.harness/specs/<slice-id>/
├── intent.md                         # pitch reference and product intent
├── capability.md                     # ASDD Discovery
├── requirements.md                   # ASDD Spec
├── spec-validation-report.md         # ASDD Validation
├── domain-model.md                   # ASDD Domain, when slice-specific
├── design.md                         # ASDD Design
├── tasks.md                          # ASDD Task Planning
└── delivery/                         # optional snapshots or links
    ├── delivery-map.yaml
    ├── discovery.md
    ├── stories.md
    ├── af-refinement.md
    ├── tech-spec.md
    └── sprint-plan.md

.harness/state/slices/<slice-id>/manifest.json
.harness/features/<slice-id>.features.json
.harness/progress/<slice-id>.md
.harness/state/locks/<slice-id>.lock
```

Keep a snapshot under `delivery/` only when the project needs an immutable handoff record. Otherwise use source paths or artifact IDs in `intent.md` and the traceability sections.

## Handoff procedure

1. **Resolve the slice.** Use the pitch ID, delivery map ID, or an explicit project slice ID. Do not create a second slice for an existing bet.
2. **Write the intent bridge.** Add the source pitch ID, source location, betting status, appetite, desired outcome, source scope IDs, and links to the delivery artifacts in `intent.md`.
3. **Run ASDD Discovery.** Convert product discovery and story context into project-specific capability language. Preserve actors, outcomes, boundaries, risks, and pending definitions.
4. **Run ASDD Spec and Validation.** Derive EARS requirements from approved stories and acceptance criteria. Every requirement must retain source story and scope IDs.
5. **Run Domain and Design.** Validate terminology, boundaries, contracts, diagrams, security, and architecture against project steering. A Product Delivery tech proposal is input, not an approval.
6. **Run Task Planning.** Convert approved design into atomic `TASK-*` entries, waves, dependencies, writable scopes, and verification commands.
7. **Create the Harness feature projection.** Create one `TASK-*` feature per task with `status: not_started`, `depends_on`, `scope_paths`, `req_ids`, and a real verification command. Do not mark features `passing` during planning.
8. **Start Implementation.** The coordinator claims the slice lock, selects dependency-ready features, assigns owners and scopes, and delegates implementation. Workers edit only their assigned scopes.
9. **Verify and close.** Run feature verification, required boundary and quality checks, and defect review. Record command and result evidence before `passing`. QA and Knowledge decide whether the slice ships, is re-shaped, parked, or abandoned.

## Traceability minimum

Every implementation feature must be able to answer:

```text
TASK → REQ → story → source scope → epic → pitch
```

Use these fields where the artifact supports metadata:

```yaml
source_pitch_id: PITCH-001
source_scope_id: SCOPE-001
epic_id: EPIC-001
story_id: US-001
req_ids: [REQ-001]
task_id: TASK-001
```

If a source ID is unavailable, use `PENDING_DEFINITION` and stop the affected gate. Do not invent an ID that could be mistaken for an approved source.

## Scope change protocol

During implementation, a change may stay inside the current bet only when it preserves the problem, outcome, appetite, no-gos, and hard quality constraints. Record it in the task or progress evidence.

Return to Shape Up for re-shaping and a new betting decision when a change alters any of the following:

- the problem or primary actor;
- the desired outcome or success signal;
- the appetite or cycle boundary;
- a must-have, no-go, security, compliance, or data-integrity constraint;
- a source scope or external contract in a way that changes the bet.

Do not extend the appetite silently. At closure, ship the verified must-have outcome, cut compatible nice-to-haves, or record a new bet.

## Handoff quality gate

The handoff is ready when:

- the pitch is bet and its source is stable;
- all derived artifacts carry source IDs;
- product and ASDD findings distinguish verified facts, proposals, assumptions, and pending definitions;
- dependency graph cycles and orphan artifacts are absent or explicitly blocked;
- ASDD requirements, design, and tasks are approved at their phase gates;
- every feature has a dependency, scope, owner plan, and verification command;
- no feature is marked `passing` without evidence;
- the next agent and next action are explicit.

