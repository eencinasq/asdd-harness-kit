---
name: mutation-testing
description: >-
  Kills surviving mutants until `asdd mutate` passes. Use when it reports survivors. Do NOT use for new tests — use
  test-driven-development.
metadata:
  tier: leaf
---

# Mutation Testing

A test that passes is not proof: a mutant that survives is a defect the tests would not notice. `asdd mutate` runs the
project's mutation tool (the `Mutation command` binding) on a feature's source files; this skill decides what each
surviving mutant needs.

**Operational boundary:** the feature's `scope_paths` (source and test files) and that feature's `evidence` in
`.harness/features/<slice>.features.json`. It never edits the binding, other features, or the tool's configuration.

## Preconditions

- `asdd mutate --slice <slice> --feature <TASK-NNN>` reports `pass` or `survivors`. `unconfigured` (no binding) and
  `no-files` end the skill with nothing to do; `error` is an escalation.
- The feature's tests pass (`test-driven-development` Step 4).

## Input / Output Contract

- **Inputs:** `slice` (`string`, required); `feature` (`string`, regex `^TASK-\d{3}$`, required); `survivors`
  (`string`, the `output_tail` of `asdd mutate --json`, required).
- **Outputs:** `tests` (stronger or new behavior tests, each naming the `REQ-NNN` it verifies); `evidence` (`string`,
  the final `asdd mutate` line, plus each equivalent mutant's `file:line`, written to the feature's `evidence`).

## Execution Protocol

### Step 1 [C4·Analyze×Conceptual] — Classify each survivor

- **Action:** read each surviving mutant in `survivors` and the code around it, and classify it in this order: (c)
  equivalent — the mutant changes no behavior a caller can observe; else (b) dead code — no requirement or caller needs
  that code; else (a) a behavior the tests do not pin.
- **Target:** the mutated lines in the feature's source files.
- **Assertion:** every survivor has exactly one class and a one-line reason.

### Step 2 [C3·Apply×Procedural] — Kill it

- **Action:** (a) add or strengthen a behavior test through `test-driven-development` (RED on the mutant's change,
  then GREEN), asserting the result a caller would see; (b) delete the dead code and its tests; (c) mark the equivalent
  mutant in the source with the tool's inline disable comment carrying the reason (Stryker
  `// Stryker disable next-line <mutator>: <reason>`, mutmut `# pragma: no mutate`, PIT exclusions) and cite its
  `file:line` in the feature's `evidence`.
- **Target:** the feature's test and source files.
- **Assertion:** the full suite still passes after each change.

### Step 3 [C5·Evaluate×Factual] — Re-run until pass

- **Action:** run `asdd mutate --slice <slice> --feature <TASK-NNN>` again after each change; repeat Steps 1–2 until it
  reports `pass`, then write that line into the feature's `evidence`. On `unconfigured` or `no-files`, write that
  result into `evidence` and stop; on `error`, stop and escalate.
- **Target:** the feature in `.harness/features/<slice>.features.json`.
- **Assertion:** `asdd mutate` exits 0 with status `pass`.

## Verification Gate

1. `asdd mutate --slice <slice> --feature <TASK-NNN> --json` reports `"status": "pass"`.
2. The repository's full-suite command exits 0.
3. Each equivalent mutant has an inline disable comment with a reason, and its `file:line` is in `evidence`.
4. Negative check: `git diff -U0` adds no disable comment without a reason, removes no assertion, and skips no test.

## Escalation Gate

HALT when `asdd mutate` reports `error`, when a survivor needs a change outside the operational boundary, or when more
than a third of the survivors would be marked equivalent (the tool or the tests are misconfigured). Escalate as
Context → Options → Recommendation → Decision Needed; never weaken the binding, disable a mutator wholesale, or mark a
mutant equivalent to reach pass.

## Handoff & Convergence

- **handoff → `test-driven-development`:** for each survivor of class (a), to write the test that kills it.
- None (terminal) otherwise: the feature's `evidence` carries the `pass` line for the QA gate (`QG-SPEC-11`).
