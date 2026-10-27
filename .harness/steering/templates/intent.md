# Intent: <slice-name>

> One intent = one scope of a bet Shape Up pitch = one ASDD slice. Written by the `product-delivery` skill (or by hand), then handed to `@asdd-discovery-agent`.
> Work outside a pitch (a cooldown fix, a bug) writes `Source: ad-hoc (cooldown)` and skips the pitch fields.

## Source

- **Pitch ID:** [PITCH-XXX]
- **Scope ID:** [SCOPE-XXX] — [scope name]
- **Scope map:** [path or link to the scope map]
- **Betting state:** `bet`
- **Cycle:** [cycle the pitch was bet for, e.g. 2026-C4]
- **Scope class:** `must_have` | `nice_to_have` (~)
- **Tracker URL:** [optional link to the pitch or scope issue]

**Rule:** Only a `bet` pitch enters ASDD. For any other state, stop and ask the human.

---

## Problem
[The part of the pitch's problem this scope solves. Who has it, when.]

## Desired Outcome
[The one observable result a person can try when this scope is done.]

## Appetite
[The bet's appetite, e.g. six weeks for the whole pitch. A boundary, not an estimate. Shared by every scope of the bet.]

## Must-have outcomes
> Written as observable EARS-style statements and checked with `jev_ears_gate`. Discovery turns them into capabilities; Spec turns them into EARS requirements.

- **MH-01:** When [trigger], the [actor] shall [observable outcome].
- **MH-02:** If [condition], then the [actor] shall [observable outcome].

## Nice-to-haves (~)
- [Cuttable item. Cut first when the appetite tightens (scope hammering).]

## No-gos
- [Explicit exclusion from the pitch. The agents must not cross it.]

## Rabbit holes
- [Risk from the pitch that touches this scope, and the shapers' patch.]

## Actors
- [Specific actor]: [what they do in this scope]

## Depends on
- [Other scope / slice that must be finished first, or "none"]

## Open questions
- [Unresolved item — PENDING_DEFINITION in the spec]
