---
name: product-delivery
description: >-
  Turns a bet Shape Up pitch into ASDD work. Splits the pitch into as many
  scopes as it needs, writes one intent.md per scope (one ASDD slice each),
  and hands every intent to the ASDD Discovery agent to run the pipeline.
  Use when a pitch has been bet and the team starts building it.
---

# Product Delivery Skill

**Version:** 2.0
**Method:** [Shape Up](https://basecamp.com/shapeup) only — no epics, user stories, story points, sprints, velocity, or backlog.

## Purpose

Take a pitch the betting table has bet on and make it buildable by the ASDD pipeline:

```text
Bet pitch
  ↓  map the scopes (as many as needed)
Scope map  ── SCOPE-001, SCOPE-002, …
  ↓  one intent per scope
.harness/specs/<slice-id>/intent.md   (one ASDD slice per scope)
  ↓  hand off
ASDD Discovery → Spec → Validation → Domain → Design → Task Planning
  ↓
Harness Implementation → QA → Knowledge
```

Shaping and betting stay upstream in the `shape-up` skill. Requirements, design, and tasks stay downstream in the ASDD agents. This skill owns only the split from pitch to intents and the traceability between them.

## Components

| Component | Path | Purpose |
|---|---|---|
| Pitch intake and scope mapping | [`references/shape-up-input.md`](./references/shape-up-input.md) | Entry gate, how to split a pitch into scopes, classification, dependencies |
| Intent handoff | [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md) | One `intent.md` per scope, slice creation, handoff to the Discovery agent, scope changes during the cycle |
| Scope map schema | [`contracts/scope-map.schema.yaml`](./contracts/scope-map.schema.yaml) | Pitch, scopes, dependencies, and intent links |
| End-to-end example | [`examples/end-to-end-example.md`](./examples/end-to-end-example.md) | One pitch split into two scopes and two intents |

If the `shape-up` skill is installed, its [`references/conversions.md`](../shape-up/references/conversions.md) defines the scope map format this skill fills.

## Gate mode (Jev module optional)

Two gates: **scope choice** — each scope is `must_have`, `nice_to_have`, or `reshape` (a `reshape` scope leaves this bet and returns to shaping; it never goes to a backlog) — and **EARS quality** — each must-have outcome written into an intent has one trigger, one observable response, and no ambiguous term. Read `.harness/config/project.json` → `modules.jev` to choose who decides:

- **`modules.jev: true` (Jev module):** call `jev_status`, then `jev_scope_choice` `{ scope }` per scope and `jev_ears_gate` `{ requirement }` per must-have on the `jev-gate` MCP server. Apply the pass rules in `.harness/steering/jev.md`; rewrite a failing outcome or record `# jev-override: accept` with a reason. `unavailable` or `isError` blocks the handoff — never fake a pass. Shell fallback (`.harness/scripts/jev-gates.mjs`) only when MCP is down.
- **Otherwise:** propose the classification and review each outcome against the criteria above, then ask the human to confirm; record each decision and who made it (`decided_by`) in the scope map and the intent.

## Entry gate

Start only when all are true:

- a canonical pitch exists with a stable `pitch_id`;
- the betting state is `bet`;
- the pitch has problem, appetite, solution, rabbit holes, and no-gos;
- the pitch passed its shaping gates (Jev or a recorded human decision).

Otherwise stop. A raw idea, request, or unshaped problem goes to `shape-up` first. `needs_shaping`, `ready_for_bet`, and `no_bet` pitches do not enter ASDD.

## Workflow

1. **Intake.** Read the pitch and record `pitch_id`, betting state, appetite, cycle, problem, desired outcome, solution elements, rabbit holes, no-gos, must-haves, and nice-to-haves. Read [`references/shape-up-input.md`](./references/shape-up-input.md).
2. **Map the scopes.** Split the pitch into as many scopes as it needs: one scope when the pitch is small and coherent, several when it has parts that can be finished and shown independently. Split by working outcome, never by layer (UI / API / database). Every must-have and nice-to-have lands in exactly one scope.
3. **Classify.** Apply the scope choice gate per scope. Keep `must_have` and `nice_to_have (~)` scopes; return `reshape` scopes to shaping.
4. **Check the map.** No unplaced pitch item, no dependency cycle, every scope has one observable outcome, and the scopes together fit the appetite. If they do not fit, cut nice-to-haves or return `RE-SHAPING_REQUIRED`. Never extend the appetite.
5. **Write the intents.** One `intent.md` per kept scope, from `.harness/steering/templates/intent.md`. Must-haves are written as observable EARS-style outcomes and pass the EARS quality gate. Read [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md).
6. **Create the slices.** `node .harness/scripts/init-slice.mjs <slice-id>` per intent (lite by default; `--full` only for a scope known upfront to be cross-cutting).
7. **Hand off.** Hand each intent to `@asdd-discovery-agent`, in dependency order. Independent scopes may run in parallel with separate owners.

## Artifact states

`PITCH_INTAKE → SCOPE_MAP → SCOPE_VALIDATION → INTENTS_WRITTEN → HANDED_OFF`

Critical gaps block a transition. Record blockers as `PENDING_DEFINITION`.

## Traceability

Every intent, requirement, and Harness feature must trace back:

```text
TASK → REQ → intent (slice) → scope → pitch
```

Fields: `source_pitch_id`, `source_scope_id`, `slice_id`, `req_ids`, `task_id`. If a source ID is missing, write `PENDING_DEFINITION` and stop the affected gate; never invent an ID that looks approved.

## Anti-hallucination rules

Never invent requirements, business rules, architecture, APIs, schemas, UI details, estimates, or approvals. Use:

- `PENDING_DEFINITION`
- `ASSUMPTION — CONFIRMATION REQUIRED`
- `PROPOSED — VALIDATION REQUIRED`

## Final rule

Downstream agents may add precision but must not silently change the meaning of the pitch. If the problem, outcome, appetite, or no-gos would change: flag `RE-SHAPING_REQUIRED`, name the source artifact, and stop until the shapers decide.
