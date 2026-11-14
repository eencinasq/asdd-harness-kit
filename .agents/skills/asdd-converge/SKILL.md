---
name: asdd-converge
description: >-
  Marks a verified feature passing. Use when its verification passed. Do NOT use to code — use asdd-implement.
metadata:
  tier: leaf
---

# asdd-converge

Cheap converge before `passing`: `req_ids`, test mentions, and evidence — via the CLI sensor, not an LLM checklist alone.

**Operational boundary:** updates the target feature's `status` / `evidence` in `.harness/features/`, appends
`feature_completed` session, runs `asdd converge`, `asdd sync`, `asdd check`. Does not edit product source (fix only
via `asdd-implement`).

## Input / Output Contract

- **Inputs:** `slice_id` (`string`, optional); `feature_id` (`string`, optional); `strict` (`boolean`, default false —
  pass `--strict` to `asdd converge`).
- **Outputs:** `converge_report` (`text`); `feature_status` (`enum`, `passing` | `blocked`).

## Execution Protocol

### Step 1: Converge sensor

- **Action:** run `asdd converge --slice <id>` (add `--strict` when `strict`). Fix FAIL findings only through
  `asdd-implement` (test mentions, req_ids). Do not mark `passing` while converge exits non-zero.
- **Target:** the slice features.
- **Assertion:** `asdd converge` exits 0 (or only WARNs when not strict).

### Step 2: Mark passing

- **Action:** set the feature `status` to `passing` with non-empty `evidence` (verification commands + results). Append
  `feature_completed` session with `scope_paths`. Run `asdd sync --slice <id>` (stamps `evidence_hash`).
- **Target:** features file + sessions.
- **Assertion:** the feature is `passing` with `evidence` and `evidence_hash` after sync.

### Step 3: Session check

- **Action:** run `asdd check --live`. On FAIL, leave the feature `in_progress` again and hand off to implement.
- **Target:** invariants.
- **Assertion:** `asdd check --live` exits 0.

## Verification Gate

1. `asdd converge --slice <slice_id>` exits 0.
2. `grep -q '"status": "passing"' .harness/features/<slice_id>.features.json` for the feature.
3. `asdd check --live` exits 0.
4. Negative check: no new product source edits in this skill's diff (only harness features/sessions/PROGRESS).

## Escalation Gate

HALT when converge FAILs need product edits, when evidence is missing, or when check FAILs from other slices block the
session. Escalate as Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **redirect → `asdd-implement`:** when converge or check requires code/test changes.
- **redirect → `asdd-next`:** when the feature is `passing` and more work remains.
- None (terminal) when the slice has no remaining features.
