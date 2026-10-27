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
- `jev_scope_choice` ran for every scope; `reshape` scopes are removed;
- the project bindings and quality gates under `.harness/steering/` are filled.

`needs_shaping`, `ready_for_bet`, and `no_bet` pitches never enter ASDD. Return them to `shape-up`.

## One intent per scope

For each kept scope:

1. **Choose a slice ID.** Lowercase, hyphenated, named after the scope in the project's language (e.g. `orders-quick-reorder`). Do not create a second slice for a scope that already has one.
2. **Create the slice.** `node .harness/scripts/init-slice.mjs <slice-id>` (lite by default; `--full` only when the scope is known upfront to be cross-cutting).
3. **Write `.harness/specs/<slice-id>/intent.md`** from `.harness/steering/templates/intent.md`:
   - Source: `Pitch ID`, `Scope ID`, scope map link, `bet`, cycle, scope class.
   - Problem and desired outcome narrowed to this scope.
   - Appetite: the bet's appetite (shared by all scopes).
   - Must-have outcomes as EARS-style statements (`MH-01`, …). Run `jev_ears_gate` on each; rewrite or record `# jev-override: accept`.
   - Nice-to-haves (~), no-gos, rabbit holes, actors, depends on, open questions.
4. **Record the slice ID** on the scope in the scope map.

A small pitch with one scope produces one intent. A pitch with five scopes produces five intents. There is no parent container above the intents; the pitch and the scope map link them.

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
- **A newly discovered scope:** add it to the scope map, run `jev_scope_choice`, and write a new intent for it.

Return to Shape Up (`RE-SHAPING_REQUIRED`) when a change alters the problem or primary actor, the desired outcome, the appetite, a must-have or no-go, or a security, compliance, or data-integrity constraint.

Never extend the appetite. When time runs short, hammer the scope: cut `~` items, then `nice_to_have` scopes. At the end of the cycle, ship what is verified or let the circuit breaker stop the bet.

## Handoff quality gate

The handoff is complete when:

- every kept scope has exactly one slice and one `intent.md`;
- every intent carries `source_pitch_id` and `source_scope_id`;
- every must-have outcome passed `jev_ears_gate` or has a recorded override;
- dependencies between intents are acyclic and written in `Depends on`;
- the next agent (`@asdd-discovery-agent`) and the slice order are explicit.
