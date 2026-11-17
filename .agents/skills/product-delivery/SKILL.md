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
bet pitch → scope map → **grounding** → **Goldfish scope-split review** → **intent fitness** → one `intent.md` per fit
scope → ASDD.
Shaping and betting stay upstream (`shape-up`); requirements, design, and tasks stay downstream (the ASDD agents). This
skill owns the split from pitch to **codeable** intents, **the scope map in this repository**, and the traceability
between them.

**Critique-first / no-glazing:** when reviewing a map or split, start with the weakest point; forbid empty praise; every
verdict quotes the map or pitch. Drafting the map may use conversation history (Elephant); the scope-split review must
not (Goldfish) — see [`references/scope-split-review.md`](./references/scope-split-review.md).

**Operational boundary:** reads the pitch; writes `docs/pitches/<pitch-id>/scope-map.yaml`,
`docs/pitches/<pitch-id>/scope-grounding.md`, `docs/pitches/<pitch-id>/scope-split-review.md`, and, per **fit** kept scope, `.harness/specs/<slice-id>/intent.md` plus
the slice `asdd slice init` creates. It never edits the pitch. In PO mode it writes no repository file (see PO mode).

## PO mode

When `.harness/config/project.json` has a `tracker` block and the session is a PO/PM session (the
`asdd-shaping-agent`, or the user says so), Steps 1–7 run the same, reading the repository only as evidence, and their
artifacts go to the tracker: the scope map, scope grounding, and scope-split review as comments on the pitch item, and
one **Intent item** per fit scope, child of the pitch, whose body follows
`.agents/skills/external-trackers/references/intent-format.md`. Step 8 is replaced: the skill
never runs `asdd slice init` and never writes `intent.md` — engineers import each Intent item with `asdd intake`. Operations per
tracker, placement, and a complete Intent body: [`references/po-mode-tracker-output.md`](./references/po-mode-tracker-output.md).
Without a `tracker` block, PO mode stops and asks for one.

| Component | Path | Purpose |
|---|---|---|
| Pitch intake and scope mapping | [`references/shape-up-input.md`](./references/shape-up-input.md) | Entry gate, splitting, classification, dependencies |
| Grounding (shared with shape-up) | [`references/grounding.md`](./references/grounding.md) | Reuse / Extend / New with evidence, reference slices |
| Scope-split review (Goldfish) | [`references/scope-split-review.md`](./references/scope-split-review.md) | Multi-lens critique before intents |
| Intent handoff + fitness | [`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md) | Intent fitness, `intent.md`, slice init, Discovery |
| PO mode output | [`references/po-mode-tracker-output.md`](./references/po-mode-tracker-output.md) | Tracker operations, placement, Intent item example |
| Scope map schema | [`contracts/scope-map.schema.yaml`](./contracts/scope-map.schema.yaml) | Pitch, scopes, `intent_fit`, validation |
| End-to-end example | [`examples/end-to-end-example.md`](./examples/end-to-end-example.md) | Pitch → review → fit intents |

## Preconditions

All must hold, or the skill does not start:

- a canonical pitch exists with a stable `pitch_id`, and its `betting_state` is `bet`;
- the pitch has problem, appetite, solution, rabbit holes, and no-gos;
- the pitch passed its shaping gates (a recorded human decision, `decided_by`);
- `asdd --version` exits 0 (slice creation; knowledge and grounding in PO mode).

A raw idea, request, or unshaped problem, or a `needs_shaping`, `ready_for_bet`, or `no_bet` pitch, does not enter ASDD.

## Input / Output Contract

- **Inputs:** `pitch` (`path`, `docs/pitches/<pitch-id>/pitch.md`, or the `handoff.yaml` that `external-trackers`
  writes for a tracker pitch; `betting_state: bet`, required).
- **Outputs:** `scope_map` (`yaml`, [`contracts/scope-map.schema.yaml`](./contracts/scope-map.schema.yaml), written to
  `docs/pitches/<pitch-id>/scope-map.yaml`); `scope_split_review` (`markdown`,
  [`scope-split-review.md`](./references/scope-split-review.md)); `scope_grounding` (`markdown`, one Reuse / Extend / New
  table per scope, written to `docs/pitches/<pitch-id>/scope-grounding.md`); `intents` (`markdown`, one
  `.harness/specs/<slice-id>/intent.md` per **fit** kept scope, from `.harness/steering/templates/intent.md`).

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

### Step 3: Ground the scopes

- **Action:** for each scope, run the grounding of [`references/grounding.md`](./references/grounding.md) (start from the
  pitch's `## Grounding` table when it has one): `asdd knowledge search`, `asdd knowledge slice`, and
  `asdd knowledge trace` for existing capabilities and requirements; `codegraph explore` for the components it would
  touch. Give the scope its own Reuse / Extend / New table with evidence refs. When an existing capability already
  delivers a scope's outcome (no `New` or `Extend` row has anything left to build), merge or cut the scope: fold it
  into the scope that needs it, or drop it from the bet with `decided_by` — never map it as new work.
- **Target:** `docs/pitches/<pitch-id>/scope-grounding.md` (one `## <SCOPE-NN>` heading and table per scope) and the
  scope map.
- **Assertion:** every scope has a table whose `Reuse` and `Extend` rows cite evidence that exists today; no kept scope
  duplicates an existing capability; a scope with a `PENDING_DEFINITION` row is not classified yet.

### Step 4: Classify (scope choice gate)

- **Action:** propose `must_have`, `nice_to_have`, or `reshape` per scope and ask a human to decide; record each
  decision with `decided_by`. A `reshape` scope leaves this bet and returns to shaping — it never goes to a backlog.
- **Target:** the scope map.
- **Assertion:** every scope has a class and a `decided_by`.

### Step 5: Check the map

- **Action:** check no unplaced pitch item, no dependency cycle, one observable outcome per scope, and that the kept
  scopes fit the appetite. If they do not fit, cut nice-to-haves or return `RE-SHAPING_REQUIRED`; never extend the
  appetite.
- **Target:** the scope map.
- **Assertion:** the map's `validation` section records these four checks; its `status` is `validated` or `blocked`.

### Step 6: Goldfish scope-split review

- **Action:** run [`references/scope-split-review.md`](./references/scope-split-review.md) (critique-first, fresh-context).
  Write `docs/pitches/<pitch-id>/scope-split-review.md`; ask a human to accept or ignore each material finding
  (`decided_by`). Fix the map or halt until `Status: ready_for_intents`.
- **Target:** `docs/pitches/<pitch-id>/scope-split-review.md` and the scope map.
- **Assertion:** every lens has a cited verdict; no unresolved fail remains without `decided_by`.

### Step 7: Intent fitness, then write intents

- **Action:** for each kept scope, record `intent_fit` on the map (one outcome, lite-fit or explicit `--full`/`re-split`
  with `decided_by`, EARS-ready must-haves, self-contained, grounded). **Unfit scopes do not get `asdd slice init`** —
  re-split, reshape, or `RE-SHAPING_REQUIRED`. For each **fit** scope, write one `intent.md`
  ([`references/asdd-harness-handoff.md`](./references/asdd-harness-handoff.md)) with the scope's `## Grounding` table
  from Step 3; confirm EARS must-haves with `decided_by`.
- **Target:** scope map `intent_fit` + `.harness/specs/<slice-id>/intent.md`.
- **Assertion:** every kept scope has `intent_fit.status: fit` before its intent exists; each intent names pitch and
  scope IDs.

### Step 8: Create the slices and hand off

- **Action:** `asdd slice init <slice-id>` per **fit** intent (lite by default; `--full` only when `intent_fit` recorded
  an explicit full decision; `--hotfix` is not used for bet scopes). Record the slice ID on its scope; hand each intent
  to `@asdd-discovery-agent` in dependency order. If Discovery finds an unfit intent, return it here — do not re-shape
  inside Discovery.
- **Target:** `.harness/state/slices/<slice-id>/`.
- **Assertion:** `asdd check` exits 0 and every fit kept scope in the map has a `slice_id`.

Artifact states:
`PITCH_INTAKE → SCOPE_MAP → SCOPE_GROUNDING → SCOPE_VALIDATION → SCOPE_SPLIT_REVIEW → INTENT_FIT → INTENTS_WRITTEN → HANDED_OFF`.
Traceability: `TASK → REQ → intent (slice) → scope → pitch`. Never invent requirements, business rules, architecture,
APIs, schemas, UI details, estimates, approvals, or an ID that looks approved.

## Verification Gate

1. `grep -c '^ *status: validated' docs/pitches/<pitch-id>/scope-map.yaml` prints 1 or more (the map passed Step 5).
2. `test -f docs/pitches/<pitch-id>/scope-split-review.md` exits 0 and the file contains `ready_for_intents` or an
   explicit blocked status with `decided_by`.
3. For each fit kept scope: `grep -cE '\*\*(Pitch|Scope) ID:\*\* (PITCH|SCOPE)-' .harness/specs/<slice-id>/intent.md`
   prints 2, `grep -c '^| Kind | What | Evidence |' .harness/specs/<slice-id>/intent.md` prints 1, and the map has
   `intent_fit.status: fit` for that scope.
4. Grounding: `grep -c '^| Kind | What | Evidence |' docs/pitches/<pitch-id>/scope-grounding.md` equals the number of
   scopes in the map.
5. `asdd check` exits 0.
6. PO mode: each Intent item read back from the tracker starts with the `asdd-intent` fence and has the seven required
   headings of `intent-format.md`; `git status --porcelain` lists nothing this run changed (no intent, no slice).
7. Negative check: `git diff --name-only -- docs/pitches/<pitch-id>/pitch.md` prints nothing (the pitch is unchanged).

## Escalation Gate

HALT when the pitch is not `bet` or misses a precondition: return it to `shape-up`. HALT with `RE-SHAPING_REQUIRED`,
naming the source artifact, when the problem, outcome, appetite, or no-gos would change — downstream agents may add
precision but never silently change the pitch. HALT when a source ID is missing (`PENDING_DEFINITION`). HALT when a
kept scope is unfit and the human will not re-split or accept `--full`. Escalate as Context → Options → Recommendation
→ Decision Needed.

## Handoff & Convergence

- **redirect → `shape-up`:** when the pitch is not bet, is incomplete, or needs re-shaping.
- **redirect → `external-trackers`:** when the pitch lives in a tracker and its handoff fields have not been read yet.
- The ASDD Discovery agent takes each **fit** intent (`@asdd-discovery-agent`); unfit work returns to this skill.
