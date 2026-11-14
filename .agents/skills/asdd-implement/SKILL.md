---
name: asdd-implement
description: >-
  Codes the in_progress feature. Use when a TASK starts. Do NOT use to pick one — use asdd-next.
metadata:
  tier: leaf
---

# asdd-implement

Edits only the active feature's `scope_paths` (plus allowed harness session/feature updates), runs its verification,
and leaves evidence for converge.

**Operational boundary:** product files listed in the in_progress feature's `scope_paths`; feature tracker fields
`evidence` (draft); session append + `asdd sync`. Never marks `passing` (that is `asdd-converge`). Never edits unmapped
product files.

## Input / Output Contract

- **Inputs:** `slice_id` (`string`, optional); `feature_id` (`string`, optional; default: the sole `in_progress`
  feature).
- **Outputs:** `changed_paths` (`path[]`); `verification_result` (`string`, command output); `draft_evidence` (`string`).

## Execution Protocol

### Step 1: Lock the feature

- **Action:** run `asdd status`. Read `.harness/features/<slice_id>.features.json` and select the `in_progress` feature
  (or the named id). Record `scope_paths` and `verification`.
- **Target:** status + features file.
- **Assertion:** exactly one target feature is `in_progress` with non-empty `scope_paths`.

### Step 2: Implement inside scope

- **Action:** change only paths under `scope_paths` (and tests that name the feature's `req_ids`). Prefer
  test-driven-development when behavior is testable. Do not refactor outside scope.
- **Target:** `scope_paths`.
- **Assertion:** `git diff --name-only` is a subset of mapped paths (plus harness sessions/features).

### Step 3: Verify and sync

- **Action:** run each `verification` command; write draft `evidence` text on the feature (status stays
  `in_progress`); append a session note; run `asdd sync --slice <id>` and `asdd check --live` if FAIL, fix mapped
  files only.
- **Target:** features file + sessions.
- **Assertion:** verification commands exit 0; `asdd check --live` has no FAIL from this feature's unmapped edits.

## Verification Gate

1. Every command in the feature's `verification` array exits 0.
2. `asdd check --live` exits 0 or only WARNs unrelated to unmapped edits from this session.
3. Negative check: `git diff --name-only` lists no product path outside the feature `scope_paths` and harness records.

## Escalation Gate

HALT when scope is empty, when verification needs secrets or network the environment lacks, or when a FAIL requires
editing an unmapped file. Escalate as Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `asdd-converge`:** when verification passed and the feature is ready to mark `passing`.
- **redirect → `asdd-next`:** when the wrong feature was active.
