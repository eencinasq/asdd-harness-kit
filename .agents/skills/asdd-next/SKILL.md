---
name: asdd-next
description: >-
  Picks the next ready feature. Use when choosing what to build. Do NOT use to code — use asdd-implement.
metadata:
  tier: leaf
---

# asdd-next

Chooses the next feature that may start: dependency-ready, not blocked, respecting lite seriality (one `in_progress`).

**Operational boundary:** reads `.harness/features/`, `.harness/PROGRESS.md`, and `asdd status` output. Writes nothing
except when the coordinator must set a single feature to `in_progress` in the features file and append a
`feature_started` session (then `asdd sync`).

## Input / Output Contract

- **Inputs:** `slice_id` (`string`, optional; default: the in_progress slice from `asdd status`).
- **Outputs:** `feature_id` (`string`, the TASK to start); `scope_paths` (`path[]`); `verification` (`string[]`).

## Execution Protocol

### Step 1: Read squad state

- **Action:** run `asdd status`. Identify the target slice (argument or single `in_progress` / active work). Read
  `.harness/features/<slice_id>.features.json`.
- **Target:** status output and the features file.
- **Assertion:** the features file exists and lists at least one feature.

### Step 2: Select

- **Action:** pick the lowest `priority` feature that is `not_started` (or `pending`), whose `depends_on` are all
  `passing`, and that does not overlap `scope_paths` with another `in_progress` feature. On a lite slice, refuse if any
  feature is already `in_progress`.
- **Target:** the features list.
- **Assertion:** one `feature_id` is named, or report "none ready" with why.

### Step 3: Optionally start

- **Action:** only when the user asks to start it: set that feature to `in_progress`, append a `feature_started`
  session with its `scope_paths`, run `asdd sync --slice <id>`. Otherwise stop after naming the candidate.
- **Target:** features file + sessions + sync.
- **Assertion:** `asdd status` lists the feature under Active Work when started.

## Verification Gate

1. `asdd status` exits 0.
2. When a feature was started: `grep -q '"status": "in_progress"' .harness/features/<slice_id>.features.json` exits 0.
3. Negative check: no product source under `src/` was edited by this skill.

## Escalation Gate

HALT when two slices compete without a named `slice_id`, when lite already has `in_progress`, or when every remaining
feature is blocked. Escalate as Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `asdd-implement`:** when a feature is `in_progress` and coding should begin.
- **redirect → `asdd-status`:** when no feature is ready.
