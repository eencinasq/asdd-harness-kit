# Pitch Intake and Scope Mapping

This guide defines the input contract for `product-delivery` and how a bet pitch is split into scopes. Each kept scope later becomes one ASDD intent (see [`asdd-harness-handoff.md`](./asdd-harness-handoff.md)).

The pitch is the source of product intent and commitment boundaries. The scope map adds structure; it must not silently change the pitch. This workflow does not shape raw ideas.

## Required input

A canonical Shape Up pitch with:

- a stable pitch identifier, or an explicit `PENDING_DEFINITION`;
- betting state `bet` and the cycle it was bet for;
- an appetite (small batch: one to two weeks; big batch: six weeks);
- a problem and desired outcome;
- the rough solution (elements, breadboard or fat-marker sketch);
- must-haves, nice-to-haves, and no-gos;
- rabbit holes and how the shapers patched them;
- assumptions and open questions.

Optional companions: the betting decision, a scope map drafted by the shapers, risk notes, a shareable pitch.

If the canonical pitch is absent, or its state is not `bet`, send the input to the `shape-up` skill.

## Source field mapping

| Pitch field | Use in the scope map and intents |
|---|---|
| Pitch ID | `source_pitch_id` on the map and every intent |
| Betting state and cycle | Entry gate; recorded in each intent |
| Appetite | Shared boundary for all scopes of the bet; never an estimate |
| Problem | Each intent's problem, narrowed to its scope |
| Desired outcome | Split into one observable outcome per scope |
| Rough solution | Context for each scope, never a verified requirement |
| Must-haves | Assigned to exactly one scope; become the intent's must-have outcomes |
| Nice-to-haves (~) | Assigned to exactly one scope; cuttable when the appetite tightens |
| No-gos | Copied to every scope they bound |
| Rabbit holes | Copied to the scopes they touch, with the shapers' patch |
| Assumptions / open questions | `PENDING_DEFINITION` in the affected intent |

If a required field is missing, keep `PENDING_DEFINITION` and mark the scope map `blocked` until it is resolved. Do not fill it from intuition.

## What a scope is

A scope is a part of the project that can be built, integrated, and finished on its own, so a person can try it working (Shape Up, "Map the Scopes"). Good scopes:

- have **one observable outcome**;
- cut **vertically** through every layer they need (UI, API, data), never one layer alone;
- are named in the **project's language**, so the team can talk about them;
- are **independent** where possible; a dependency exists only when one scope cannot be finished before another.

## Splitting the pitch

Split as much as the pitch needs, no more:

- **One scope** — the pitch is a small batch, or the whole outcome only works as one piece. The pitch becomes a single intent.
- **Several scopes** — the pitch has parts that can be finished and shown separately (different places in the breadboard, different actors, or outcomes that work without each other).

Signals that a candidate scope is too big: it has more than one observable outcome; it touches unrelated places in the breadboard; its must-haves serve different actors. Split it.

Signals that two scopes should merge: neither can be shown working without the other; they always change the same files; one has no outcome of its own.

The building team may discover new scopes during the cycle. A new scope that keeps the problem, outcome, appetite, and no-gos joins the map (and gets its own intent). Anything else is `RE-SHAPING_REQUIRED`.

## Classifying scopes

Run `jev_scope_choice` `{ scope }` for each scope:

| Class | Meaning | Action |
|---|---|---|
| `must_have` | The bet fails without it | Keep; its intent is built first |
| `nice_to_have` (~) | Valuable, but cuttable when the appetite tightens (scope hammering) | Keep; mark `~` in the intent |
| `reshape` | Does not fit this bet | Remove from the map; return to shaping. Never park it in a backlog |

If Jev and the shapers disagree, the shapers decide and record the reason in the scope map.

## Dependencies

- Add `depends_on` only when a scope cannot be finished before another one. Ordering preferences are not dependencies.
- Check for cycles before writing intents. A cycle means the split is wrong: merge or re-split those scopes.
- Independent scopes may be built in parallel by separate owners with disjoint file scopes.

## Scope map gate

Before writing intents, verify:

- the pitch is `bet` and its ID is stable;
- every must-have and nice-to-have is placed in exactly one scope, and no pitch item is dropped;
- every scope has one observable outcome and a `must_have` or `nice_to_have` class;
- no dependency cycles;
- the scopes together fit the appetite (cut `~` items or return `RE-SHAPING_REQUIRED`; never extend the appetite);
- open questions are `PENDING_DEFINITION`, not guesses.

Record the map in [`../contracts/scope-map.schema.yaml`](../contracts/scope-map.schema.yaml) format.
