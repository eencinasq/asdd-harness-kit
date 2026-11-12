---
name: business-model-canvas
description: >-
  Turns a Business Model Canvas or Lean Canvas into proposed capabilities and personas traced to their blocks. Use when
  a Discovery intent supplies a BMC or Lean Canvas. Do NOT use for free-text vocabulary — use
  domain-language-extraction; or for existing code — use capability-discovery.
metadata:
  tier: leaf
---

# Business Model Canvas Analysis

Turns a Business Model Canvas (BMC) or a Lean Canvas into **proposed** capability candidates for Discovery. The canvas is
the only source: everything produced here is a proposal for the PO to confirm, traced to the canvas block it came from.
Never fill a gap from general knowledge of the industry.

**Operational boundary:** reads the canvas; writes only `.harness/specs/<slice-id>/canvas.yaml`. Capabilities reach
`capability.md` through the Discovery agent after the PO confirms them.

## Input / Output Contract

- **Inputs:** `canvas` (`path` or pasted text, a BMC or Lean Canvas with named blocks, required).
- **Outputs:** `canvas_analysis` (`yaml`, written to `.harness/specs/<slice-id>/canvas.yaml`, schema in Step 4): keys
  `canvas_type`, `source`, `blocks`, `mapping`, `capabilities`, `personas`, `gaps`.

## Execution Protocol

### Step 1: Extract

- **Action:** copy each block of the canvas, as written, into `blocks`. A missing or empty block is
  `PENDING_DEFINITION` (markers: `.harness/steering/skills.md`).
- **Target:** `canvas`.
- **Assertion:** `blocks` has nine keys (the nine BMC or the nine Lean Canvas blocks), verbatim or `PENDING_DEFINITION`.

### Step 2: Map

- **Action:** apply the table of the canvas type to each block; write one `mapping` entry per block naming what it feeds.

  | BMC block | Feeds | Notes |
  |---|---|---|
  | Customer Segments | Personas | One persona per segment the canvas names; never split or merge segments on your own |
  | Value Propositions | Core capabilities | One candidate per value the canvas states for a segment |
  | Channels | Platform / access capabilities | How a segment reaches the product |
  | Customer Relationships | Support / engagement capabilities | |
  | Revenue Streams | Billing capabilities | Propose MUST priority; the PO decides it |
  | Key Activities | Domain processes | A capability candidate only when the product itself performs the activity |
  | Key Resources | Domain entities and constraints | Not capabilities |
  | Key Partnerships | Integration capabilities | One per external system or partner the product exchanges data with |
  | Cost Structure | Constraints (cost NFR candidates) | Not capabilities |

  | Lean Canvas block | Feeds |
  |---|---|
  | Problem | The problem statement of the capabilities that address it |
  | Customer Segments | Personas (early adopters noted as such) |
  | Unique Value Proposition | Core capabilities, as for Value Propositions |
  | Solution | Capability candidates, one per solution element |
  | Channels | Platform / access capabilities |
  | Revenue Streams | Billing capabilities (propose MUST; the PO decides) |
  | Cost Structure | Constraints (cost NFR candidates) |
  | Key Metrics | Success measures for the capabilities' EARS criteria (never invent a target value) |
  | Unfair Advantage | Context only; no capability |
- **Target:** `blocks`.
- **Assertion:** `mapping` has one entry per block.

### Step 3: Propose

- **Action:** draft the capability candidates and personas the mapping calls for. Every item is
  `PROPOSED — VALIDATION REQUIRED` and lists its `source_blocks`. An FR or EARS criterion is drafted only when its block
  states the behavior; otherwise write the question for the PO.
- **Target:** `capabilities` and `personas`.
- **Assertion:** no item lacks `source_blocks`; no FR or criterion lacks a block that states it.

### Step 4: Report gaps and write

- **Action:** list every `PENDING_DEFINITION` block and every question of Step 3 under `gaps`; write the file:

  ```yaml
  canvas_type: bmc | lean
  source: <file or message the canvas came from>
  blocks:
    value_propositions: "…"     # or PENDING_DEFINITION
  mapping:
    - block: revenue_streams
      feeds: billing capabilities
  capabilities:
    - name: <capability name, in the canvas's words>
      status: PROPOSED — VALIDATION REQUIRED
      source_blocks: [value_propositions, customer_segments]
      persona: <persona name>
      proposed_priority: MUST | SHOULD | COULD   # the PO confirms
      functional_requirements: []                # only behaviors the block states
      ears_criteria: []                          # only when the block states trigger and response
      questions: []
  personas:
    - name: <segment name>
      source_blocks: [customer_segments]
  gaps:
    - block: key_metrics
      status: PENDING_DEFINITION
  ```

  Rate the confidence for the session `evidence` (`QG-DEC-10`; thresholds stay in `quality-gates.md`): **high** — all
  nine blocks present and Value Propositions name the segment they serve; **medium** — blocks missing but Value
  Propositions and Customer Segments clear; **low** — see the Escalation Gate.
- **Target:** `.harness/specs/<slice-id>/canvas.yaml`.
- **Assertion:** the file parses as YAML and has the seven top-level keys.

## Verification Gate

1. `test -s .harness/specs/<slice-id>/canvas.yaml` exits 0.
2. `grep -cE '^(canvas_type|source|blocks|mapping|capabilities|personas|gaps):' .harness/specs/<slice-id>/canvas.yaml`
   prints 7.
3. Every capability is a proposal: the count of `status: PROPOSED — VALIDATION REQUIRED` equals the count of
   `source_blocks:` lines under `capabilities`.
4. Negative check: `git diff --name-only -- .harness/specs/<slice-id>/capability.md` prints nothing.

## Escalation Gate

HALT when the canvas is referenced but not supplied, or Value Propositions are missing (low confidence): ask for the
canvas instead of proposing capabilities. HALT when two blocks contradict each other on a segment. Escalate as Context →
Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `anti-pattern-detection`:** after the PO confirms candidates and the Discovery agent drafts
  `capability.md`; passes the drafted capabilities.
- **redirect → `domain-language-extraction`:** when the canvas uses terms the glossary does not define.
