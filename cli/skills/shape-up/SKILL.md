---
name: shape-up
description: >-
  Shapes ideas into Shape Up pitches, reviews them, and records the bet. Use when writing or reviewing a pitch or
  coaching shaping. Do NOT use for splitting a bet pitch into intents in a .harness/ repository — use product-delivery;
  or for trackers — use external-trackers.
metadata:
  tier: leaf
---

# Shape Up — Shaping Workflow

**Fixed time, variable scope.** Decide how much time a problem is worth (the appetite), then shape a solution that fits
it. Shaped work is **rough** (room for the team), **solved** (main elements connected), and **bounded** (explicit
appetite and no-gos). Shaping produces options; the betting table decides. Philosophy:
[`references/methodology.md`](./references/methodology.md).

**Critique-first / no-glazing:** when reviewing a brief or pitch, start with the weakest point; forbid empty praise;
every verdict quotes the artifact. Drafting may use conversation history (Elephant); prefer a fresh-context (Goldfish)
pass before `ready_for_bet`.

**Operational boundary:** talks with the shaper; in repo mode writes only the pitch file and the derived artifacts the
user asks for, under the pitch directory (`docs/pitches/<pitch-id>/` unless the project names another) — including
optional `concepts_brief.md` and brownfield `context-pack.md`; in PO mode writes only to the tracker (see PO mode). It
never writes `.harness/` files or intents.

## PO mode

When `.harness/config/project.json` has a `tracker` block and the session is a PO/PM session (the
`asdd-shaping-agent`, or the user says so), the skill writes no repository file: the pitch, its review, and the betting
decision go to the tracker's pitch item, with the operations and placement of
`.agents/skills/product-delivery/references/po-mode-tracker-output.md`. Grounding (Step 3) is the same in both modes —
the repository is read as evidence. Without a `tracker` block, PO mode stops and asks for one.

| Component | Path | Purpose |
|---|---|---|
| Flows | [`references/flows.md`](./references/flows.md) | Coaching questions per flow |
| Concepts brief | [`references/concepts-brief-template.md`](./references/concepts-brief-template.md) | Hypothesis + readiness before a formal pitch |
| Pitch template | [`references/pitch-template.md`](./references/pitch-template.md) | Five ingredients |
| Grounding | `.agents/skills/product-delivery/references/grounding.md` | Mandatory: Reuse / Extend / New with evidence, reference slices |
| Brownfield pack | [`references/brownfield-bootstrap.md`](./references/brownfield-bootstrap.md) | Optional context before shaping |
| Techniques | [`references/techniques.md`](./references/techniques.md) | Breadboard / fat marker |
| Conversions | [`references/conversions.md`](./references/conversions.md) | Share / discovery / bundle |

## Input / Output Contract

- **Inputs:** `request` (`string`, the raw idea, an existing pitch, or a conversion or betting request, required);
  `pitch` (`path`, an existing `pitch.md`, optional — required for review, conversion, and betting);
  `product_mode` (`enum`, `established` | `new`, asked when not given).
- **Outputs:** `concepts_brief` (`markdown`, optional, [`concepts-brief-template.md`](./references/concepts-brief-template.md));
  `pitch` (`markdown`, [`pitch-template.md`](./references/pitch-template.md) with a `pitch_id:` and a
  `betting_state:` line and a `## Grounding` table, written to `docs/pitches/<pitch-id>/pitch.md`); `pitch_review`
  (`markdown table`, Step 5, in
  the same directory as `review.md`); `derived` (`markdown`, a conversion of
  [`conversions.md`](./references/conversions.md) — `share`, `discovery`, `bundle`, or `scope_map` outside a harness
  repository — written next to the pitch).

## Gates

Before betting, the pitch passes two gates, decided by a human: **appetite fit** (fits the appetite, no hidden
complexity, feasible with the team's resources) and **rabbit holes** (each known rabbit hole is patched, cut by a no-go,
or a reason to reject the bet). Record each answer and who gave it (`decided_by`) next to the betting decision. A failed
criterion means refine, patch the no-gos, or reject — never bet.

Before elevating a vague idea to a formal pitch, the **concepts brief readiness gate** must pass (or record explicit
deferrals with `decided_by`) — see [`concepts-brief-template.md`](./references/concepts-brief-template.md).

## Execution Protocol

### Step 1: Pick the flow and the mode

- **Action:** parse the request into one flow and ask for the product mode when the user has not said it:

  | Request | Flow |
  |---|---|
  | Shape a named feature or problem | 1 Shape new work |
  | An existing pitch to check | 2 Review |
  | "I know what I want, just format it" | 3 Quick pitch |
  | A vague idea or problem | 4 Explore first |
  | Share, convert, or hand off a pitch | 5 Convert |
  | Bet a pitch and build it in this repository | 6 Bet and hand off |
  | Brownfield context before shaping | see [`brownfield-bootstrap.md`](./references/brownfield-bootstrap.md) |

  Mode: **established** (strict appetite, rabbit holes patched, no-gos enforced, circuit breaker) or **new**
  (flexible appetite, unknowns flagged, no-gos directional, the pitch is a working document). Bug-sized one-file fixes
  skip this skill (`asdd slice init --hotfix`).
- **Target:** `request`.
- **Assertion:** one flow and one mode are named back to the user before Step 2 (or brownfield pack is chosen).

### Step 2: Run the flow

- **Action:** follow the questions and challenges of the chosen flow in
  [`references/flows.md`](./references/flows.md) (breadboarding and fat-marker sketches:
  [`references/techniques.md`](./references/techniques.md)). Flow 4 writes `concepts_brief.md` and stops at the
  readiness gate when the idea is not ready: name what evidence is missing (`parked` or open questions).
- **Target:** the conversation with the shaper; optional `docs/pitches/<pitch-id>/concepts_brief.md`.
- **Assertion:** the five ingredients each have an answer or a `PENDING_DEFINITION` marker (markers:
  `.harness/steering/skills.md`), **or** Flow 4 left a brief with an explicit readiness outcome; nothing was invented
  for the shaper.

### Step 3: Ground the pitch

- **Action:** before writing anything, run the grounding of `.agents/skills/product-delivery/references/grounding.md`:
  `asdd knowledge search` for capabilities, requirements, and slices the idea touches; `asdd knowledge slice` and
  `asdd knowledge trace` for what they cover; `codegraph explore` for the components a solution would reuse or extend;
  `.harness/PROGRESS.md` plus `asdd knowledge slice` for DONE slices of similar shape. Build the Reuse / Extend / New
  table, every row with evidence refs (`REQ:<slice>/REQ-NNN`, `slice:<id>`, `path:<repo-path>`; `none` only on `New`),
  and pick at least one reference slice with its feature count — or record that none exists and what was searched.
  Bring each `Reuse` row back into the Solution: the pitch shapes the gap, not what already works.
- **Target:** the conversation with the shaper; the `## Grounding` table and the appetite's reference slices.
- **Assertion:** every row cites a ref that exists today or is `PENDING_DEFINITION` (then the pitch stays
  `needs_shaping`); `Reuse` and `Extend` rows never cite only `none`; nothing was asserted without a tool result.

### Step 4: Write the pitch

- **Action:** when readiness allows, fill [`references/pitch-template.md`](./references/pitch-template.md) with the five
  ingredients, the Step 3 `## Grounding` table, and the reference-slice lines under `## Appetite`; give the pitch a
  stable `pitch_id` (keep an existing one) and `betting_state: needs_shaping` or `ready_for_bet`. Link or note
  `concepts_brief.md` when one was used.
- **Target:** `docs/pitches/<pitch-id>/pitch.md`.
- **Assertion:** the file has the five ingredient headings, `## Grounding`, `pitch_id:`, and `betting_state:`.

### Step 5: Review against the ingredients

- **Action:** **critique-first** — state the strongest reason the pitch could fail appetite before any praise. Judge
  each element and cite the pitch for every verdict — quote the sentence that passes it, or name what is missing (a
  verdict without a quote or a named gap is not a verdict). Prefer a fresh-context (Goldfish) pass that ignores the
  drafting chat:

  | Element | Pass | Fail |
  |---|---|---|
  | Problem | Specific friction, named users, evidence | Vague "customers want X" |
  | Appetite | Explicit time budget (small or big batch) | No time constraint or "ASAP" |
  | Solution | Breadboard or sketch, elements connected | Wireframes, or just words |
  | Rabbit holes | Technical risks flagged with a patch | "Should be straightforward" |
  | No-gos | Explicit exclusions listed | Nothing out of scope |

  Also check the grounding: a `New` row that an existing capability covers, or an appetite far above its reference
  slices, is the review's weakest point to state first.

  Write `| Element | Verdict | Evidence from the pitch | Fix |`, one row per element. Before "Ready for betting",
  restate the riskiest element or unpatched rabbit hole and why it does not block — or refuse `ready_for_bet`. Present
  the Gates to the human.
- **Target:** `docs/pitches/<pitch-id>/review.md`.
- **Assertion:** five verdict rows, each with a quote or a named gap; the gate answers carry `decided_by`; no empty
  praise lines.

### Step 6: Convert or record the bet

- **Action:** for Flow 5, produce the smallest conversion the request needs (`share`, `discovery`, `bundle`; `scope_map`
  only when the pitch leaves this repository) per [`references/conversions.md`](./references/conversions.md): the
  canonical pitch stays unchanged, every derived artifact carries `source_pitch_id`, and derived details are `DERIVED`,
  `PROPOSED`, or `PENDING_DEFINITION`. Shape Up has no epics, stories, story points, sprints, or backlog: never convert
  to those. For Flow 6, record the betting table's decision in `betting_state` (`bet` or `no_bet`; `no_bet` is let go,
  with no backlog) with the cycle and `decided_by`.
- **Target:** the pitch directory.
- **Assertion:** the pitch file is byte-identical except `betting_state` and the decision lines; each derived file
  names its `source_pitch_id`.

## Verification Gate

1. `grep -cE '^## (Problem|Appetite|Solution|Rabbit [Hh]oles|No-[Gg]os)' docs/pitches/<pitch-id>/pitch.md` prints 5.
2. `grep -cE '^(pitch_id|betting_state):' docs/pitches/<pitch-id>/pitch.md` prints 2.
3. Grounding: `grep -c '^| Kind | What | Evidence |' docs/pitches/<pitch-id>/pitch.md` prints 1, and
   `grep -cE '^- [a-z0-9][a-z0-9_-]*: [0-9]+ features|^Reference slices: none' docs/pitches/<pitch-id>/pitch.md` prints
   1 or more.
4. After a review: `grep -cE '^\| (Problem|Appetite|Solution|Rabbit holes|No-gos) \|' docs/pitches/<pitch-id>/review.md`
   prints 5.
5. After Flow 4 with a brief: `test -f docs/pitches/<pitch-id>/concepts_brief.md` exits 0.
6. After a conversion: `grep -L 'source_pitch_id' docs/pitches/<pitch-id>/*.md` lists only `pitch.md`, `review.md`, and
   optional `concepts_brief.md` / `context-pack.md`.
7. PO mode: the pitch item read back from the tracker has the five ingredient headings, `## Grounding`, and
   `betting_state:`, and `git status --porcelain` lists nothing this run changed (it writes no repository file).
8. Negative check: `git status --porcelain -- .harness` lists nothing this run changed (no intent, slice, or session).

## Escalation Gate

HALT when a conversion would change the problem, outcome, appetite, or boundaries: return `RE-SHAPING_REQUIRED` with the
source artifact instead of rewriting the pitch. HALT when the betting decision is asked of you: the betting table
decides. HALT when the shaper cannot name the friction or the affected user and readiness is not deferred
(`decided_by`). Escalate as Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `product-delivery`:** when `betting_state` is `bet` and the repository has `.harness/`; passes `pitch`
  (product-delivery then applies Goldfish split + intent fitness).
- **handoff → `external-trackers`:** when the pitch or its betting decision must be recorded in a tracker; passes `pitch`.
