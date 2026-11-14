# Scope → Intent → ASDD Handoff

This reference defines how each scope of a bet pitch becomes one ASDD slice with its own `intent.md`, and how that intent reaches the ASDD Discovery agent. Use it when the project has `.harness/`.

Ownership:

- **Shape Up** owns the pitch, the bet, the appetite, and the no-gos.
- **Product Delivery** owns the scope map and the intents (the split).
- **ASDD** owns capabilities, requirements, domain, design, and tasks.
- **Harness** owns execution: owners, file scopes, verification evidence, and session state.

## Handoff entry gate

Write intents only when:

- the pitch is `bet` and its ID is stable;
- the scope map passed its gate ([`shape-up-input.md`](./shape-up-input.md));
- the Goldfish scope-split review is `ready_for_intents` ([`scope-split-review.md`](./scope-split-review.md));
- every scope has a recorded scope choice (`decided_by`); `reshape` scopes are removed;
- every kept scope has **intent fitness** `status: fit` (below);
- the project bindings and quality gates under `.harness/steering/` are filled.

`needs_shaping`, `ready_for_bet`, and `no_bet` pitches never enter ASDD. Return them to `shape-up`.

## Intent fitness (codeable)

A kept scope is **fit** for ASDD only when all hold. Record them under `intent_fit` on the scope in the map:

| Check | Field | Fail → |
|-------|--------|--------|
| Exactly one observable outcome | `one_outcome` | Split or merge |
| **Lite-fit** — expected as one `lite` (or later hotfix) slice unless an explicit `--full` or re-split is recorded | `lite_fit` | Re-split, reshape, or set `lite_fit: false` with `decided_by` + notes for `--full` |
| Must-haves are EARS-ready (one trigger, one observable response, no ambiguous term) with human confirm | `ears_ready` | Rewrite MH; do not invent |
| Intent is **self-contained** (another agent understands it without the pitch chat) | `self_contained` | Enrich intent; do not rely on chat |

`intent_fit.status` is `fit`, `unfit`, or `pending`. **Unfit scopes must not run `asdd slice init`.** Re-split, reshape, or return `RE-SHAPING_REQUIRED`. Discovery must not re-shape an unfit intent — send it back to product-delivery.

## One intent per fit scope

For each **fit** kept scope:

1. **Choose a slice ID.** Lowercase, hyphenated, named after the scope in the project's language (e.g. `orders-quick-reorder`). Do not create a second slice for a scope that already has one.
2. **Create the slice.** `asdd slice init <slice-id>` (lite by default; `--full` only when `intent_fit` records an explicit full decision).
3. **Write `.harness/specs/<slice-id>/intent.md`** from `.harness/steering/templates/intent.md`:
   - Source: `Pitch ID`, `Scope ID`, scope map link, `bet`, cycle, scope class.
   - Problem and desired outcome narrowed to this scope.
   - Appetite: the bet's appetite (shared by all scopes).
   - Must-have outcomes as EARS-style statements (`MH-01`, …). Check each against the EARS criteria and record who confirmed it (`decided_by`).
   - Optional `## Intent fitness` mirroring the map's `intent_fit`.
   - Nice-to-haves (~), no-gos, rabbit holes, actors, depends on, open questions.
4. **Record the slice ID** on the scope in the scope map.

A small pitch with one fit scope produces one intent. Unfit scopes produce zero intents until fixed. There is no parent container above the intents; the pitch and the scope map link them.

## Handing off to Discovery

Hand each intent to `@asdd-discovery-agent` with its slice ID:

- **Order:** scopes with no `Depends on` first. A dependent scope starts after its prerequisite slice passes QA.
- **Parallel:** independent scopes may run at the same time with separate owners and disjoint file scopes (Harness enforces this).
- **Must-haves before nice-to-haves:** within the cycle, build `must_have` scopes first; `~` scopes are cut first when time runs short.

From there the normal pipeline runs per slice: Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge, under the phase gates in `quality-gates.md`.

## Traceability minimum

Every Harness feature must be able to answer:

```text
TASK → REQ → intent (slice) → scope → pitch
```

Fields where the artifact supports metadata:

```yaml
source_pitch_id: PITCH-001
source_scope_id: SCOPE-001
slice_id: orders-quick-reorder
req_ids: [REQ-001]
task_id: TASK-001
```

If a source ID is unavailable, write `PENDING_DEFINITION` and stop the affected gate. Never invent an ID that could pass as approved.

## Scope changes during the cycle

A change stays inside the bet only when it keeps the problem, outcome, appetite, no-gos, and hard quality constraints. Then:

- **Inside an existing scope:** record it in that slice's task or progress evidence.
- **A newly discovered scope:** add it to the scope map, record its scope choice, and write a new intent for it.

Return to Shape Up (`RE-SHAPING_REQUIRED`) when a change alters the problem or primary actor, the desired outcome, the appetite, a must-have or no-go, or a security, compliance, or data-integrity constraint.

Never extend the appetite. When time runs short, hammer the scope: cut `~` items, then `nice_to_have` scopes. At the end of the cycle, ship what is verified or let the circuit breaker stop the bet.

## Handoff quality gate

The handoff is complete when:

- every **fit** kept scope has exactly one slice and one `intent.md`;
- every kept scope has `intent_fit.status: fit` (unfit scopes have no slice);
- every intent carries `source_pitch_id` and `source_scope_id` and is self-contained;
- every must-have outcome passed the EARS criteria, confirmed by a human (`decided_by`);
- dependencies between intents are acyclic and written in `Depends on`;
- the next agent (`@asdd-discovery-agent`) and the slice order are explicit.
