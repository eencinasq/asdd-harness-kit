---
name: product-delivery
description: >-
  Splits a bet Shape Up pitch into scopes and writes one intent.md (one ASDD slice) per scope. Use when a pitch has been
  bet and building starts in a repository with .harness/. Do NOT use for shaping or betting — use shape-up; or for
  tracker reads and syncs — use external-trackers.
metadata:
  tier: leaf
---

# Product Delivery

**Method:** [Shape Up](https://basecamp.com/shapeup) only — no epics, user stories, story points, sprints, velocity, or
backlog. Takes a pitch the betting table bet on and makes it buildable by the ASDD pipeline:
bet pitch → scope map (`SCOPE-001`, `SCOPE-002`, …) → one `intent.md` per scope → ASDD Discovery … Knowledge. Shaping
and betting stay upstream (`shape-up`); requirements, design, and tasks stay downstream (the ASDD agents). This skill
owns the split from pitch to intents, **the scope map in this repository**, and the traceability between them.

**Operational boundary:** reads the pitch; writes `docs/pitches/<pitch-id>/scope-map.yaml` and, per kept scope,
`.harness/specs/<slice-id>/intent.md` plus the slice `asdd slice init` creates. It never edits the pitch.

| Component | Path | Purpose |
|---|---|---|
| Pitch intake and scope mapping | [`references/shape-up-input.md`](./references/shape-up-input.md) | Entry gate, splitting a pitch into scopes, classification, dependencies |
| Intent handoff | [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md) | One `intent.md` per scope, slice creation, Discovery handoff, scope changes during the cycle |
| Scope map schema | [`contracts/scope-map.schema.yaml`](./contracts/scope-map.schema.yaml) | Pitch, scopes, dependencies, intent links |
| End-to-end example | [`examples/end-to-end-example.md`](./examples/end-to-end-example.md) | One pitch split into two scopes and two intents |

## Preconditions

All must hold, or the skill does not start:

- a canonical pitch exists with a stable `pitch_id`, and its `betting_state` is `bet`;
- the pitch has problem, appetite, solution, rabbit holes, and no-gos;
- the pitch passed its shaping gates (a recorded human decision, `decided_by`);
- `asdd --version` exits 0 (slice creation).

A raw idea, request, or unshaped problem, or a `needs_shaping`, `ready_for_bet`, or `no_bet` pitch, does not enter ASDD.

## Input / Output Contract

- **Inputs:** `pitch` (`path`, `docs/pitches/<pitch-id>/pitch.md`, or the `handoff.yaml` that `external-trackers`
  writes for a tracker pitch; `betting_state: bet`, required).
- **Outputs:** `scope_map` (`yaml`, [`contracts/scope-map.schema.yaml`](./contracts/scope-map.schema.yaml), written to
  `docs/pitches/<pitch-id>/scope-map.yaml`); `intents` (`markdown`, one `.harness/specs/<slice-id>/intent.md` per kept
  scope, from `.harness/steering/templates/intent.md`, each with the pitch and scope IDs in its `## Source`).

## Execution Protocol

### Step 1: Intake

- **Action:** read the pitch and [`references/shape-up-input.md`](./references/shape-up-input.md); record `pitch_id`,
  betting state, appetite, cycle, problem, desired outcome, solution elements, rabbit holes, no-gos, must-haves, and
  nice-to-haves. A missing field is `PENDING_DEFINITION` (markers: `.harness/steering/skills.md`).
- **Target:** `pitch`.
- **Assertion:** every Precondition holds; the scope map is `blocked` while a required field is `PENDING_DEFINITION`.

### Step 2: Map the scopes

- **Action:** split the pitch into as many scopes as it needs — one when it is small and coherent, several when parts
  can be finished and shown independently. Split by working outcome, never by layer (UI / API / database).
- **Target:** `docs/pitches/<pitch-id>/scope-map.yaml`.
- **Assertion:** every must-have and nice-to-have lands in exactly one scope; each scope has one observable outcome.

### Step 3: Classify (scope choice gate)

- **Action:** propose `must_have`, `nice_to_have`, or `reshape` per scope and ask a human to decide; record each
  decision with `decided_by`. A `reshape` scope leaves this bet and returns to shaping — it never goes to a backlog.
- **Target:** the scope map.
- **Assertion:** every scope has a class and a `decided_by`.

### Step 4: Check the map

- **Action:** check no unplaced pitch item, no dependency cycle, one observable outcome per scope, and that the kept
  scopes fit the appetite. If they do not fit, cut nice-to-haves or return `RE-SHAPING_REQUIRED`; never extend the
  appetite.
- **Target:** the scope map.
- **Assertion:** the map's `validation` section records these four checks; its `status` is `validated` or `blocked`.

### Step 5: Write the intents (EARS quality gate)

- **Action:** one `intent.md` per kept scope ([`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md)).
  Must-haves are observable EARS-style outcomes: one trigger, one observable response, no ambiguous term. Propose each
  outcome, then ask a human to confirm; record `decided_by` in the intent.
- **Target:** `.harness/specs/<slice-id>/intent.md`.
- **Assertion:** each intent's `## Source` names the pitch and scope IDs, and each must-have passed the EARS review.

### Step 6: Create the slices and hand off

- **Action:** `asdd slice init <slice-id>` per intent (lite by default; `--full` only for a scope known upfront to be
  cross-cutting); record the slice ID on its scope; hand each intent to `@asdd-discovery-agent` in dependency order
  (independent scopes may run in parallel with separate owners).
- **Target:** `.harness/state/slices/<slice-id>/`.
- **Assertion:** `asdd check` exits 0 and every kept scope in the map has a `slice_id`.

Artifact states: `PITCH_INTAKE → SCOPE_MAP → SCOPE_VALIDATION → INTENTS_WRITTEN → HANDED_OFF`. Traceability:
`TASK → REQ → intent (slice) → scope → pitch`, through `source_pitch_id`, `source_scope_id`, `slice_id`, `req_ids`,
`task_id`. Never invent requirements, business rules, architecture, APIs, schemas, UI details, estimates, approvals, or
an ID that looks approved.

## Verification Gate

1. `grep -c '^ *status: validated' docs/pitches/<pitch-id>/scope-map.yaml` prints 1 or more (the map passed Step 4).
2. For each kept scope: `grep -cE '\*\*(Pitch|Scope) ID:\*\* (PITCH|SCOPE)-' .harness/specs/<slice-id>/intent.md` prints 2.
3. `asdd check` exits 0.
4. Negative check: `git diff --name-only -- docs/pitches/<pitch-id>/pitch.md` prints nothing (the pitch is unchanged).

## Escalation Gate

HALT when the pitch is not `bet` or misses a precondition: return it to `shape-up`. HALT with `RE-SHAPING_REQUIRED`,
naming the source artifact, when the problem, outcome, appetite, or no-gos would change — downstream agents may add
precision but never silently change the pitch. HALT when a source ID is missing (`PENDING_DEFINITION`). Escalate as
Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **redirect → `shape-up`:** when the pitch is not bet, is incomplete, or needs re-shaping.
- **redirect → `external-trackers`:** when the pitch lives in a tracker and its handoff fields have not been read yet.
- The ASDD Discovery agent takes each intent (`@asdd-discovery-agent`); that is the agent pipeline, not a skill.
