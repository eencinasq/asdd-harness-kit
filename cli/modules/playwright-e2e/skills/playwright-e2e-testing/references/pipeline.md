# Playwright E2E pipeline — reference

Detail of the five steps of the `playwright-e2e-testing` skill (planner, exploratory validation, generator,
executor and healer, reporter), with the plan and report templates.

## Pipeline Overview

```
spec / user request
      ⬇
┌─────────────────────────────────┐
│  Step 1 — TEST PLANNER          │  Reads spec, explores live app via browser, designs scenarios
└──────────────┬──────────────────┘
               ⬇
┌─────────────────────────────────┐
│  Step 2 — EXPLORATORY VALIDATION│  Validates test plan against live app, confirms selectors
└──────────────┬──────────────────┘
               ⬇
┌─────────────────────────────────┐
│  Step 3 — TEST GENERATOR        │  Converts test plan + exploration into Playwright scripts
└──────────────┬──────────────────┘
               ⬇
┌─────────────────────────────────┐
│  Step 4 — TEST EXECUTOR & HEALER│  Runs tests, auto-fixes failures, re-runs until green
└──────────────┬──────────────────┘
               ⬇
┌─────────────────────────────────┐
│  Step 5 — TEST REPORTER         │  Generates structured test report with coverage mapping
└─────────────────────────────────┘
```


## Step 1 — Test Planner

**Goal:** Transform requirements into a structured test plan before any code is written.

### 1.1 — Spec Discovery

If a spec name or feature is provided, read these files (in order):

1. `.harness/specs/<feature>/requirements.md` — extract MUST / SHOULD / COULD requirements
2. `.harness/specs/<feature>/design.md` — extract component names, routes, states, API contracts
3. `.harness/specs/<feature>/tasks.md` — identify which tasks are UI-facing

If no spec is provided, ask the user:

```
Before I plan the tests, I need to know what to test:

1. **Spec / feature name**: Which spec or user flow?
   (e.g. "room creation", "player onboarding", "NFT avatar selection")

2. **Spec file** (optional): Path to requirements.md or design.md?

3. **Starting URL / page**: Which page should I navigate to first?

4. **Auth required?**: Should I log in before testing?
```

### 1.2 — Resolve Stack Context

Auto-detect from project files, then override with `.harness/steering/tech.md` as source of truth:

| File found | What to infer |
|---|---|
| `package-lock.json` | packageManager = npm |
| `pnpm-lock.yaml` | packageManager = pnpm |
| `yarn.lock` | packageManager = yarn |
| `playwright.config.ts` | language = TypeScript |
| `next.config.*` | framework = Next.js |
| `.env` / `.env.test` | auth env vars, BASE_URL |

Maintain the resolved stack throughout the session:

```
STACK = {
  language:        typescript
  ext:             .ts
  packageManager:  npm
  runner:          npx
  devCommand:      "npx nx run <app>:dev"
  baseURL:         "http://localhost:3000"
  testDir:         "apps/<app>/e2e"
  auth:            { strategy: "api-cookie", loginEndpoint: "POST /api/auth/login", tokenField: "token", cookieName: "session" }
  selectorAttr:    data-testid
  ci:              github-actions
}
```

### 1.3 — Navigate and Explore the Live App (Browser-First Discovery)

Before writing any test plan, **open the browser and explore the actual interface**. This grounds the test plan in reality rather than assumptions.

1. **Navigate to the starting page** — `mcp_playwright_browser_navigate({ url: STACK.baseURL + "/<route>" })`
2. **Take an accessibility snapshot** — `mcp_playwright_browser_snapshot()` to get the full element tree. **Prefer snapshots over screenshots** — only take screenshots when visual layout matters.
3. **Explore the interface thoroughly** — use `mcp_playwright_browser_click`, `mcp_playwright_browser_type`, `mcp_playwright_browser_hover` to discover:
   - All interactive elements (buttons, links, inputs, dropdowns)
   - All forms and their fields
   - Navigation paths and page transitions
   - Hidden/conditional UI (modals, drawers, tooltips, expandable sections)
   - Loading states, empty states, error states
4. **Take a snapshot after each navigation** — always call `mcp_playwright_browser_snapshot()` after navigating to a new page or triggering a state change. This is your primary discovery tool.
5. **Map network activity** — call `mcp_playwright_browser_network_requests({ static: false })` to identify which API endpoints the page calls. This informs what to mock or assert in tests.
6. **Close the browser** — `mcp_playwright_browser_close()` when exploration is complete.

> **Rule:** Do NOT take screenshots unless absolutely necessary (e.g., visual regression baseline). Snapshots are faster, more informative, and give you element refs for the test plan.

### 1.4 — Analyze User Flows

Using the spec requirements AND the live exploration findings:

1. **Map primary user journeys** — identify the critical paths through the feature (e.g., "create room → see it in lobby → join room")
2. **Consider different user types** — authenticated vs. anonymous, NFT holder vs. non-holder, room host vs. observer
3. **Identify state transitions** — what triggers loading, success, error, and empty states?
4. **Note form validation rules** — which fields are required, what formats are accepted, what error messages appear?

### 1.5 — Design Comprehensive Scenarios

Create detailed test scenarios covering:

- **Happy path scenarios** — normal user behavior completing the intended flow
- **Edge cases and boundary conditions** — min/max values, empty inputs, special characters, long strings
- **Error handling and validation** — missing required fields, invalid data, API failures, network errors
- **Negative testing** — unauthorized access, expired sessions, concurrent actions

### 1.6 — Structure and Save the Test Plan

Each scenario MUST include:
- **Clear, descriptive title** — reads like a requirement, not a test ID
- **Requirement IDs covered** — traceability back to RREQ-xxx
- **Assumptions about starting state** — always assume blank/fresh state
- **Detailed step-by-step instructions** — specific enough for any tester to follow
- **Expected outcomes** — what the user should see after each action
- **Success criteria and failure conditions** — how to determine pass/fail

**Quality Standards:**
- Steps must be specific enough for any tester to follow without ambiguity
- Include negative testing scenarios for every form and API interaction
- Scenarios must be independent — runnable in any order with no shared mutable state
- Every MUST requirement needs at least one happy-path and one negative scenario

Produce the test plan in this format:

```markdown
## Test Plan: <Feature Name>

**Spec:** .harness/specs/<feature>/requirements.md
**App:** apps/<app-name>
**Base URL:** <STACK.baseURL>
**Auth required:** yes/no
**Explored pages:** <list of URLs visited during browser discovery>

### Requirement Coverage Matrix

| Req ID   | Requirement Summary              | Priority | Test Scenario                                    | Test Type       |
|----------|----------------------------------|----------|--------------------------------------------------|-----------------|
| RREQ-001 | User can create a room           | MUST     | Fill form with valid data → room appears in lobby | Happy path      |
| RREQ-002 | Room name is required            | MUST     | Submit with empty name → validation error shown   | Negative        |
| RREQ-003 | Loading state while creating     | SHOULD   | Submit → spinner visible → success message        | State transition|
| ...      | ...                              | ...      | ...                                              | ...             |

### Discovered Interface Elements
(from browser exploration — actual selectors found)
- [data-testid=create-room-btn] → "Create Room" button in lobby
- [data-testid=room-name-input] → Room name text field
- ...

### Test Scenarios

#### Scenario 1: <Descriptive name>
- **Covers:** RREQ-001, RREQ-003
- **Starting state:** Fresh page load, authenticated user
- **Preconditions:** Authenticated user with NFT
- **Steps:**
  1. Navigate to lobby page
  2. Click "Create Room" button
  3. Fill room name, buy-in, max players
  4. Click submit
  5. Verify success message appears
  6. Navigate back to lobby
  7. Verify new room appears in list
- **Expected outcome:** Room created successfully, visible in lobby
- **Success criteria:** Success message visible, room card appears in list
- **Failure conditions:** Error message shown, room not in lobby after refresh

#### Scenario 2: <Descriptive name>
...

### Edge Cases & Error Scenarios
- Empty required fields → validation error with specific message
- Duplicate room name → API 409 error → user-friendly error toast
- Network failure → error state with retry option
- Unauthorized access → redirect to login page

### API Calls to Monitor
- POST /api/v1/rooms → room creation (discovered via network inspection)
- GET /api/v1/rooms → lobby refresh

### States to Cover
- Loading: spinner/skeleton while API call in flight
- Success: confirmation message + redirect
- Error: validation errors, API errors, network errors
- Empty: no rooms in lobby (first-time user)
```

**Save the test plan** — write it to disk using `Write/StrReplace` at `apps/<app>/e2e/specs/<feature>/test-plan.md`. This serves as documentation for the QA team and as input for Step 2 and Step 3.

> **Note:** The test plan is also printed to the conversation for immediate review.


## Step 2 — Exploratory Validation via Browser

**Goal:** Validate the test plan against the live app. Step 1 did the initial discovery — this step does a focused verification pass, executing each scenario's happy path to confirm selectors, states, and flows match the plan.

> **If Step 1 already explored the app thoroughly** and the test plan's selector map is complete, this step can be abbreviated to a quick verification of the most critical scenarios only.

### 2.1 — Open Browser (auto-launch)

The Playwright MCP server auto-launches a visible browser on the first navigation call. There is **no explicit launch step**.

```
mcp_playwright_browser_navigate({ url: "http://localhost:3000" })
```

### 2.2 — Validate Each Critical Scenario

For each **MUST-priority** scenario in the test plan:

1. **Navigate** — `mcp_playwright_browser_navigate({ url })` to the starting page
2. **Snapshot** — `mcp_playwright_browser_snapshot()` to confirm the element tree matches the test plan's selector map
3. **Execute the happy path** — click, fill, select through the flow using the selectors from the test plan
4. **Verify state transitions** — confirm loading → success → final state matches expectations
5. **Screenshot only on mismatch** — take a screenshot only if the actual state differs from the plan
6. **Update the test plan** — if selectors or states differ, update the test plan file via `strReplace`

### 2.3 — Compile Validation Report

After validating critical scenarios, compile findings:

```markdown
## Validation Report

### Selector Verification (plan vs. actual)
| Planned Selector              | Actual Selector Found          | Status    |
|-------------------------------|--------------------------------|-----------|
| [data-testid=create-room-btn] | [data-testid=create-room-btn]  | ✅ Match  |
| [data-testid=room-name-input] | [data-testid=room-name-input]  | ✅ Match  |
| [data-testid=loading-spinner] | (not found — uses skeleton)    | ⚠️ Adjust |

### State Observations
- Loading state: Uses skeleton component, not spinner
- Error state: Toast notification, not inline error
- Empty state: "No rooms yet" message with CTA

### Test Plan Corrections Applied
- Scenario 3: Changed loading assertion from spinner to skeleton
- Added new scenario: Toast notification dismissal
```

### 2.4 — Close Browser

```
mcp_playwright_browser_close()
```

Always close the browser after exploration. A new session will be opened via `browser_navigate` if needed during healing.


## Step 3 — Test Generator

**Goal:** Convert the validated test plan + exploration findings into production-ready Playwright scripts.

### 3.1 — Generate Page Object Models

For each page/feature involved, create or update a POM class:

**File:** `apps/<app>/e2e/pages/<feature>.page.ts`

Rules:
- Constructor receives `Page`, initializes all `Locator` fields
- Use actual selectors discovered during exploration (Step 2)
- `goto()` method navigates and waits for a key element to be visible
- Action methods encapsulate multi-step interactions (fill + click + wait)
- Locator priority: `getByTestId` > `getByRole` > `getByLabel` > `getByText`
- One POM class per page/feature

```typescript
import { type Page, type Locator } from '@playwright/test';

export class <Feature>Page {
  readonly page: Page;
  // Declare all locators as readonly fields
  readonly someButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.someButton = page.getByTestId('some-btn');
  }

  async goto() {
    await this.page.goto('/<route>');
    await this.someButton.waitFor({ state: 'visible' });
  }

  // Action methods for multi-step interactions
  async doSomething() {
    await this.someButton.click();
  }
}
```

### 3.2 — Generate Spec Files

For each group of related scenarios, create a spec file:

**File:** `apps/<app>/e2e/specs/<feature>/<feature-name>.spec.ts`

Rules:
- `test.describe` groups named by feature/section
- `test.beforeEach` navigates via POM `goto()`
- Each test is independent — no shared mutable state
- Test titles read like requirements: `"User can join a poker room from the lobby"`
- Reference requirement IDs in test titles: `(RREQ-010, RREQ-014)`
- No `page.waitForTimeout()` — use `expect(locator).toBeVisible()` or `waitForURL`
- No CSS class selectors — use semantic or `data-testid` selectors
- Map each state (happy, error, loading, empty) to a separate `test()` block

```typescript
import { test, expect } from '@playwright/test';
import { FeaturePage } from '../../games/feature.page';

test.describe('Feature Name', () => {
  let featurePage: FeaturePage;

  test.beforeEach(async ({ page }) => {
    featurePage = new FeaturePage(page);
    await featurePage.goto();
  });

  test('User can perform action successfully (RREQ-001)', async ({ page }) => {
    // Arrange — setup via POM methods
    // Act — perform the action
    // Assert — verify the outcome
    await expect(featurePage.successMessage).toBeVisible();
  });

  test('Validation error when required field is empty (RREQ-002)', async ({ page }) => {
    // Negative test case
  });
});
```

### 3.3 — Write All Files to Disk

**CRITICAL:** Use `Write/StrReplace` to write every file. Reviewing or describing files without creating them is NOT acceptable.

Write in this order:
1. Page Object files first (dependencies)
2. Spec files second (consumers)


## Step 4 — Test Executor & Healer

**Goal:** Run the generated tests, detect failures, and automatically fix them. Repeat until all tests pass or a maximum of 3 healing cycles is reached.

### 4.1 — Execute Tests

Run the generated tests using the project's test runner:

```bash
npx playwright test <spec-file-path> --reporter=list
```

Or for a specific project:

```bash
npx playwright test --project=<app-name> <spec-file-path> --reporter=list
```

### 4.2 — Analyze Failures

If any tests fail, classify each failure:

| Failure Type | Cause | Healing Strategy |
|---|---|---|
| **Selector not found** | Element doesn't exist or selector changed | Re-explore with browser, update POM selector |
| **Timeout** | Element takes too long to appear | Add `waitFor` or increase timeout, check if state transition is different |
| **Assertion mismatch** | Expected text/value differs from actual | Screenshot + inspect actual value, update assertion |
| **Navigation error** | URL changed or redirect happened | Check actual URL with `browser_evaluate`, update route |
| **Auth failure** | Session expired or auth flow changed | Re-run auth fixture, check cookie/token |
| **API error** | Backend returned unexpected response | Check if API contract changed, add network intercept if needed |

### 4.3 — Heal Failing Tests

For each failure:

1. **Navigate to the failing page** — `mcp_playwright_browser_navigate({ url })` (auto-launches browser if closed)
2. **Screenshot** the actual state — `mcp_playwright_browser_take_screenshot()`
3. **Snapshot** — `mcp_playwright_browser_snapshot()` to inspect the accessibility tree and find the correct selector/value
4. **Evaluate** — `mcp_playwright_browser_evaluate({ function: "() => document.title" })` for custom JS inspection if needed
5. **Close browser** — `mcp_playwright_browser_close()`
6. **Update** the POM or spec file with the corrected selector/assertion using `Write/StrReplace` or `strReplace`

### 4.4 — Re-run Tests

After healing, re-run the tests:

```bash
npx playwright test <spec-file-path> --reporter=list
```

### 4.5 — Healing Loop

Repeat Steps 4.2–4.4 up to **3 times**. If tests still fail after 3 cycles:

- Report the remaining failures with screenshots and root cause analysis
- Flag whether the failure is in the test (fixable) or in the application (bug)
- Do NOT silently skip or delete failing tests

### Healing Cycle Tracker

```
Healing Cycle 1/3:
  - ❌ test "User can create room" — selector [data-testid=submit-btn] not found
  - Fix: Updated POM to use [data-testid=room-submit-btn]
  - Re-running...

Healing Cycle 2/3:
  - ✅ All tests passing
  - Healing complete.
```


## Step 5 — Test Reporter

**Goal:** Generate a structured test report summarizing coverage, results, and any remaining issues.

### 5.1 — Generate Test Report

After all tests pass (or max healing cycles reached), produce this report:

```markdown
## E2E Test Report: <Feature Name>

**Date:** <timestamp>
**App:** apps/<app-name>
**Spec:** .harness/specs/<feature>/requirements.md
**Total tests:** <count>
**Passed:** <count> ✅
**Failed:** <count> ❌
**Healed:** <count> 🔧

### Requirement Coverage

| Req ID   | Priority | Test File                          | Test Name                                    | Status |
|----------|----------|------------------------------------|----------------------------------------------|--------|
| RREQ-001 | MUST     | room-creation.spec.ts              | User can create a room (RREQ-001)            | ✅     |
| RREQ-002 | MUST     | room-creation.spec.ts              | Validation error for empty name (RREQ-002)   | ✅     |
| RREQ-003 | SHOULD   | room-creation.spec.ts              | Loading state during creation (RREQ-003)     | ✅     |
| RREQ-004 | COULD    | —                                  | (not covered — no UI component yet)          | ⏭️     |

### Coverage Summary
- **MUST requirements:** X/Y covered (Z%)
- **SHOULD requirements:** X/Y covered (Z%)
- **COULD requirements:** X/Y covered (Z%)
- **Overall:** X/Y covered (Z%)

### Files Generated / Modified
- `apps/<app>/e2e/pages/<feature>.page.ts` — Page Object Model (created/updated)
- `apps/<app>/e2e/specs/<feature>/<name>.spec.ts` — Test spec (created/updated)

### Healing Summary
- **Cycle 1:** Fixed 2 selector mismatches in POM
- **Cycle 2:** All tests green ✅
- **Total healing cycles:** 2/3

### Remaining Issues
- RREQ-004: No UI component exists yet — cannot test
- RREQ-007: Flaky due to animation timing — added `waitFor` but may need `toBeVisible` with longer timeout

### Recommendations
- Add `data-testid` to the loading skeleton component for more reliable assertions
- Consider adding API mocking for the room creation endpoint to test error states without backend dependency
```

---
