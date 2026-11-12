---
name: playwright-e2e-testing
description: >-
  Turns a slice's requirements into verified Playwright E2E specs: plans scenarios, validates them in a live browser
  through the Playwright MCP server, generates page objects and .spec.ts files, runs and heals them, and reports
  coverage per requirement. Use when a UI flow needs end-to-end tests. Do NOT use for unit or integration tests — use
  test-driven-development; or for one-off live debugging of a page (the web-ui module's DevTools skill).
metadata:
  tier: leaf
---

# Playwright E2E Testing

A five-step pipeline from requirements to green, self-healing Playwright tests. The browser is driven through the
`playwright` MCP server (it opens on the first navigate call); Chrome DevTools is only an adjunct for console, network,
or performance depth while healing. Step detail and templates: [`references/pipeline.md`](./references/pipeline.md).
Principles, auth fixtures, patterns, and the MCP tools: [`references/patterns.md`](./references/patterns.md).

**Operational boundary:** writes only the E2E test tree the project uses (page objects, `.spec.ts`, fixtures, the test
plan and report); reads requirements, design, and the running app. It never edits application code.

## Preconditions

- The `playwright` MCP server is configured and its tools are listed.
- The app runs at a URL the user named or the project's dev server (`.harness/steering/tech.md` → E2E section).
- `npx playwright --version` exits 0 in the repository.

## Input / Output Contract

- **Inputs:** `requirements` (`path`, `.harness/specs/<slice-id>/requirements.md`, required); `base_url` (`string`,
  the app URL, required); `flows` (`string[]`, user flows to cover, optional — default: every UI MUST requirement).
- **Outputs:** `test_plan` (`markdown`, the plan template of the reference, in the E2E test tree); `specs` (`ts files`,
  page objects and `.spec.ts`, each test title naming its `REQ-NNN`); `e2e_report` (`markdown`, coverage per requirement
  and the healing summary).

## Execution Protocol

### Step 1: Plan

- **Action:** read the requirements and design, resolve the stack context, explore the live app, and design scenarios
  (happy path, edge, error) per requirement.
- **Target:** `test_plan`.
- **Assertion:** every UI MUST requirement has at least one scenario in the plan's coverage matrix.

### Step 2: Validate in the browser

- **Action:** run each critical scenario through the Playwright MCP tools; confirm selectors (`data-testid` first) and
  states; correct the plan.
- **Target:** the running app at `base_url`.
- **Assertion:** every selector the plan uses resolved on the live page.

### Step 3: Generate

- **Action:** write page objects and `.spec.ts` files to disk following the principles in the patterns reference (POM,
  selector priority, no hard waits, isolation, requirement ID in each title).
- **Target:** the project's E2E test tree.
- **Assertion:** `npx playwright test --list` lists every planned test.

### Step 4: Run and heal

- **Action:** run the tests; for each failure decide test defect or app defect; heal test defects and re-run, within
  the healing-loop limit of the pipeline reference. An app defect is reported, never worked around in the test.
- **Target:** the generated specs.
- **Assertion:** `npx playwright test <specs>` exits 0, or each remaining failure is an app defect with its evidence.

### Step 5: Report

- **Action:** write the report: coverage per requirement, files generated, healing summary, remaining issues.
- **Target:** `e2e_report`.
- **Assertion:** every requirement of the plan appears in the report with a status.

## Verification Gate

1. `npx playwright test <specs>` exits 0 (or the report lists each failing test as an app defect with evidence).
2. `grep -L 'REQ-[0-9]\{3\}' <specs>` prints nothing (every spec file names a requirement).
3. `grep -rn 'waitForTimeout' <specs>` prints nothing.
4. Negative check: `git diff --name-only` lists only files in the E2E test tree.

## Escalation Gate

HALT when the Playwright MCP server is unavailable, the app does not start, a requirement's behavior is ambiguous in
the live app, or healing reaches its loop limit on a test defect. Escalate as Context → Options → Recommendation →
Decision Needed; never weaken an assertion to make a test pass.

## Handoff & Convergence

- **redirect → `test-driven-development`:** when a failure is an app defect; passes the failing test and its evidence.
