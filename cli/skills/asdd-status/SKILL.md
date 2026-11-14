---
name: asdd-status
description: >-
  Reports slice and pipeline health. Use when asking what is in progress. Do NOT use to edit — use asdd-next.
metadata:
  tier: leaf
---

# asdd-status

Read-only view of the harness: slices, phases, escalation, learning patterns, and pipeline metrics.

**Operational boundary:** runs `asdd status` / `asdd status --metrics` / `asdd status --html` only. Never edits
`.harness/` or product files.

## Input / Output Contract

- **Inputs:** `mode` (`enum`, `default` | `metrics` | `html` | `json`, default `default`).
- **Outputs:** `report` (`text`, stdout of the chosen `asdd status` invocation).

## Execution Protocol

### Step 1: Run status

- **Action:** from the repo root with `.harness/`, run exactly one of: `asdd status`, `asdd status --metrics`,
  `asdd status --html`, or `asdd status --json` according to `mode`. Do not invent slice state from memory.
- **Target:** the project root.
- **Assertion:** the command exits 0 and prints a non-empty report.

## Verification Gate

1. `asdd status` exits 0.
2. Negative check: `git diff --name-only` prints nothing (this skill writes no files).

## Escalation Gate

HALT when `.harness/` is missing or `asdd` is not on PATH. Escalate as Context → Options → Recommendation → Decision Needed (`asdd doctor` / `asdd init-flow`).

## Handoff & Convergence

- **redirect → `asdd-next`:** when the user asks what to work on next.
- **redirect → `asdd-converge`:** when a feature is ready to close.
- None (terminal) otherwise.
