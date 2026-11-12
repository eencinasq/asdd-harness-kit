---
name: test-driven-development
description: >-
  Drives a code change with a failing test first and records the run as feature evidence. Use when changing code whose
  behavior a test can pin. Do NOT use for live-browser checks, UI craft, or API contract design (module skills); or for
  configuration or docs.
metadata:
  tier: leaf
---

# Test-Driven Development

Write a failing test before the code that makes it pass; for a bug, reproduce it with a test before fixing it. Tests are
the proof — "seems right" is not done. Examples, the test pyramid, test sizes, good-test practices, and anti-patterns:
[`references/testing-practices.md`](./references/testing-practices.md), read when a step needs them.

**Operational boundary:** the test files and the source files of the change (in a slice: the feature's `scope_paths`),
plus that feature's `evidence` in `.harness/features/<slice>.features.json`. It never edits other features, specs, or
the test configuration of the repository unless the task is about it.

## Preconditions

- The repository's test commands are known before the first RED: read `.harness/steering/tech.md`, then the build files
  (`package.json`, `pom.xml`/`build.gradle`, `pyproject.toml`, `go.mod`, `Cargo.toml`, a `Makefile`), README,
  CONTRIBUTING, and CI workflows. Prefer checked-in wrappers (`./gradlew`, `./mvnw`, `make test`). Never assume a
  default such as `npm test`.
- The focused-test command runs one existing test and exits 0 before you add yours.

## Input / Output Contract

- **Inputs:** `behavior` (`string`, the behavior to add or the bug report, required); `req_ids` (`string[]`, regex
  `^REQ-\d{3}$`, required inside a slice); `feature` (`string`, regex `^TASK-\d{3}$`, required inside a slice).
- **Outputs:** `tests` (`test files`, in the repository's convention, each test that verifies a requirement naming its
  `REQ-NNN` in its name or a comment next to it); `evidence` (`string`, the printed result of the feature's
  `verification` commands, written to the feature's `evidence` field).

## Execution Protocol

### Step 1: RED

- **Action:** write one test for the next behavior (for a bug, the test that shows it). In a slice, put the `REQ-NNN`
  it verifies in the test name: `it('REQ-004 rejects a deposit above the limit', …)` — `DRIFT-04` looks for that
  token, and spec compliance counts only requirements a test names.
- **Target:** the test file, by the repository's naming convention.
- **Assertion:** the focused-test command fails, and fails for the expected reason (not a syntax or import error).

### Step 2: GREEN

- **Action:** write the minimum code that makes the test pass.
- **Target:** the source files of the change.
- **Assertion:** the focused-test command exits 0.

### Step 3: REFACTOR

- **Action:** improve names and structure without changing behavior; repeat Steps 1–3 for the next behavior.
- **Target:** the same source and test files.
- **Assertion:** the focused-test command still exits 0 after each refactor edit.

### Step 4: Full suite and evidence

- **Action:** run the full suite with the repository's command, then the feature's `verification` commands; write what
  they printed (pass/fail counts, or the failing test) into the feature's `evidence` before setting it `passing`. "Tests
  pass" is not evidence. `asdd sync` stamps `evidence_hash`; editing a file in the feature's `scope_paths` later reopens
  it (`DRIFT-02`) and the loop runs again.
- **Target:** the feature in `.harness/features/<slice>.features.json`.
- **Assertion:** the full suite exits 0 and `evidence` quotes the counts. Run a command again only after a change that
  could affect it.

## Verification Gate

1. The repository's full-suite command exits 0.
2. In a slice: `asdd check` exits 0 (no `DRIFT-04` for the feature's `req_ids`), and
   `grep -rl 'REQ-<nnn>' <test dirs>` finds each of `req_ids`.
3. A bug fix: the reproduction test is in the diff (`git diff --name-only` lists a test file).
4. No test is skipped or disabled by the change: `git diff -U0` adds no `.skip`, `xit`, `@Disabled`, or `pytest.mark.skip`.
5. Negative check: `git diff --name-only` lists only the feature's `scope_paths`, test files, and the features file.

## Escalation Gate

HALT when the test commands cannot be found or the focused test cannot run (Preconditions), when a RED test passes
immediately (it does not test what you think), when GREEN needs a change outside the operational boundary, or when the
full suite fails on a test the change did not touch. Escalate as Context → Options → Recommendation → Decision Needed;
never skip or weaken a test to get green.

## Handoff & Convergence

- **redirect → `codegraph`:** when the code to change or the tests it affects are unknown (`codegraph explore`,
  `codegraph affected`).
- None (terminal) otherwise: a UI change is verified in a live browser by the web-ui module's skill when installed.
