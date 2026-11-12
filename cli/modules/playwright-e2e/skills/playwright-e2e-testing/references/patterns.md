# Playwright patterns — reference

Core principles, auth fixtures, common patterns, and the Playwright MCP tools, for Steps 3–4 of the
`playwright-e2e-testing` skill.

## Core Principles

1. **Page Object Model (POM)** — selectors and actions live in reusable page classes.
2. **Selector priority**:
   - `getByTestId` using `data-testid` (project convention — always first)
   - `getByRole` + accessible name
   - `getByLabel` for form fields
   - `getByText` for readable content
   - CSS/XPath only as last resort with a comment explaining why
3. **No hard waits** — never `waitForTimeout`. Use `expect(locator).toBeVisible()`, `waitForResponse`, `waitForURL`.
4. **Isolation** — every test starts clean. `beforeEach` setup, `afterEach` teardown.
5. **Determinism** — mock external APIs, seed test data, freeze clocks.
6. **Descriptive naming** — `"User can reset password via email link"` not `"test reset"`.
7. **ALWAYS write files to disk** — create or update `.spec.ts` and page object files using `Write/StrReplace`. Reviewing without writing is NOT acceptable.
8. **Requirement traceability** — every test title references the requirement ID it covers.


## Auth Fixture Patterns

**API endpoint → token/cookie (project default)**
```typescript
const res = await page.request.post('/api/auth/login', {
  data: { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD },
});
const { token } = await res.json();
await page.context().addCookies([{
  name: 'session',
  value: token,
  url: process.env.BASE_URL!,
}]);
```

**UI login flow**
```typescript
await page.goto('/login');
await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/dashboard');
```

**OAuth / SSO / storage state**
```typescript
// Save once: npx playwright codegen --save-storage=e2e/.auth/user.json <baseURL>
// Then in config: use: { storageState: 'e2e/.auth/user.json' }
```


## Common Patterns

### API Mocking
```typescript
await page.route('**/api/v1/products', route =>
  route.fulfill({ json: { products: mockProducts } })
);
```

### Network assertion
```typescript
const responsePromise = page.waitForResponse('**/api/v1/submit');
await submitButton.click();
const response = await responsePromise;
expect(response.status()).toBe(200);
```

### Visual regression
```typescript
await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixelRatio: 0.02 });
```

### Accessibility
```typescript
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```


## Playwright MCP Tools Reference

The `playwright` MCP server (`npx @playwright/mcp@latest`) provides these tools. All are prefixed `mcp_playwright_browser_*`.

### Navigation & Session

| MCP Tool | Purpose | Key Parameters |
|---|---|---|
| `browser_navigate` | Go to a URL — **auto-launches browser on first call** | `url` (required) |
| `browser_navigate_back` | Go back in history | — |
| `browser_close` | Close the page and free memory | — |
| `browser_tabs` | List, create, close, or select tabs | `action`: list/new/close/select |
| `browser_resize` | Resize the browser window | `width`, `height` |

### Interaction

| MCP Tool | Purpose | Key Parameters |
|---|---|---|
| `browser_click` | Click an element | `target` (element ref from snapshot), `element` (description) |
| `browser_type` | Type text into an editable element | `target`, `text`, `submit` (press Enter after?), `slowly` (char by char?) |
| `browser_fill_form` | Fill multiple form fields at once | `fields[]` with `target`, `name`, `type`, `value` per field |
| `browser_select_option` | Select dropdown option | `target`, `values[]` |
| `browser_hover` | Hover over an element | `target` |
| `browser_drag` | Drag and drop between elements | `startTarget`, `endTarget` |
| `browser_press_key` | Press a keyboard key | `key` (e.g. `ArrowLeft`, `Enter`) |
| `browser_file_upload` | Upload files | `paths[]` (absolute paths) |
| `browser_drop` | Drop files/data onto an element | `target`, `paths[]` or `data` |
| `browser_handle_dialog` | Accept/dismiss a dialog | `accept`, `promptText` |

### Observation & Inspection

| MCP Tool | Purpose | Key Parameters |
|---|---|---|
| `browser_snapshot` | **Accessibility snapshot** — returns numbered element tree. **Use this for selector discovery, NOT screenshots.** | `target` (optional, scope to element), `depth`, `boxes` |
| `browser_take_screenshot` | Capture visual screenshot (PNG/JPEG) | `type`, `fullPage`, `target` (element), `filename` |
| `browser_evaluate` | Run arbitrary JavaScript on page or element | `function` (JS code string), `target` (optional element) |
| `browser_console_messages` | Get console log output | `level`: error/warning/info/debug |
| `browser_network_requests` | List all network requests since page load | `static` (include images/fonts?), `filter` (URL regex) |
| `browser_network_request` | Get full details of a single request | `index` (1-based from network_requests list), `part` |

### Advanced

| MCP Tool | Purpose | Key Parameters |
|---|---|---|
| `browser_run_code_unsafe` | Execute arbitrary Playwright code | `code`: `async (page) => { ... }` |
| `browser_wait_for` | Wait for text to appear/disappear or time to pass | `text`, `textGone`, `time` |

### Critical Tool Usage Rules

1. **`browser_snapshot` is your primary inspection tool** — it returns a numbered accessibility tree with element references (e.g. `ref="e45"`). Use these refs as `target` values for click/type/fill actions.
2. **`browser_navigate` auto-launches the browser** — there is no separate launch step. Just navigate to the URL.
3. **`target` parameter** — always use the exact element reference from the most recent `browser_snapshot` output (e.g. `ref="e45"`), or a unique CSS selector.
4. **`browser_evaluate`** replaces the old `browser_assert` and `browser_get_content` — run JS functions to extract data or assert conditions.
5. **API mocking** — use `browser_run_code_unsafe` with `page.route()` to intercept network requests:
   ```
   browser_run_code_unsafe({ code: "async (page) => { await page.route('**/api/v1/rooms', route => route.fulfill({ json: { data: [] } })); }" })
   ```
6. **`browser_close`** must be called at the end of every session.


## Selector Cheat Sheet

### Playwright MCP Workflow (browser interaction)

When interacting via MCP tools, always follow this pattern:

```
1. Call mcp_playwright_browser_snapshot() → returns numbered element tree
2. Find the element in the tree → note its ref (e.g. ref="e45")
3. Use ref="e45" as the `target` parameter in click/type/fill_form calls
```

Example snapshot output:
```
- button "Sign in" [ref="e12"]
- textbox "Email" [ref="e15"]
- textbox "Password" [ref="e18"]
- link "Forgot password?" [ref="e21"]
```

Then interact:
```
mcp_playwright_browser_type({ target: "e15", text: "user@example.com" })
mcp_playwright_browser_type({ target: "e18", text: "password123" })
mcp_playwright_browser_click({ target: "e12" })
```

### Playwright Test Code (generated .spec.ts files)

```typescript
// By test ID (project convention — always preferred)
page.getByTestId('submit-btn')

// By role + name
page.getByRole('button', { name: 'Sign in' })
page.getByRole('dialog', { name: 'Confirm' })

// By form label
page.getByLabel('Password')

// By text content
page.getByText('Forgot password?')
```


## Error Handling

| Error | Action |
|---|---|
| `No browser session` | Call `mcp_playwright_browser_navigate({ url })` — it auto-launches |
| Element not found | Call `mcp_playwright_browser_snapshot()` to get the current accessibility tree and find the correct element ref |
| Timeout | Use `mcp_playwright_browser_wait_for({ text: "..." })` before the action, or increase timeout via `browser_run_code_unsafe` |
| Navigation failed | Call `mcp_playwright_browser_evaluate({ function: "() => window.location.href" })` to check actual URL |
| Assertion failed | Call `mcp_playwright_browser_take_screenshot()` immediately to capture the actual state |
| Dialog blocking | Call `mcp_playwright_browser_handle_dialog({ accept: true })` to dismiss unexpected dialogs |
| Network issue | Call `mcp_playwright_browser_network_requests({ static: false })` to inspect API calls |


## Anti-Patterns to Avoid

| ❌ Avoid | ✅ Use Instead |
|---|---|
| Calling `browser_launch` (doesn't exist) | `mcp_playwright_browser_navigate({ url })` — auto-launches |
| `page.waitForTimeout(3000)` | `await expect(locator).toBeVisible()` or `mcp_playwright_browser_wait_for({ text })` |
| `page.locator('.btn-primary')` | `page.getByTestId('submit-btn')` or `page.getByRole('button', { name: '...' })` |
| Using `browser_get_accessibility_tree` (old tool) | `mcp_playwright_browser_snapshot()` — returns numbered element tree |
| Using `browser_assert` (old tool) | `mcp_playwright_browser_evaluate({ function: "() => { ... }" })` for JS assertions |
| Using `browser_fill` (old tool) | `mcp_playwright_browser_type({ target, text })` or `mcp_playwright_browser_fill_form({ fields })` |
| Using `browser_screenshot` (old tool) | `mcp_playwright_browser_take_screenshot({ type: "png" })` |
| Using `browser_network_intercept` (old tool) | `mcp_playwright_browser_run_code_unsafe({ code: "async (page) => { await page.route(...) }" })` |
| Guessing element selectors | Always call `mcp_playwright_browser_snapshot()` first, use `ref` values from output |
| Hardcoded `data-cy` or `data-qa` | Use `data-testid` (project convention) |
| Hardcoded `npx` when project uses pnpm | Use `STACK.runner` |
| Hardcoded port `3000` when app runs on different port | Use `STACK.baseURL` |
| Sharing state between tests | `beforeEach` + isolated setup |
| Credentials in code | `process.env.TEST_USER_EMAIL` |
| Asserting implementation details | Assert visible UI outcomes |
| Reviewing without writing files | Use `Write/StrReplace` to write every identified test file |
| Writing tests without running them | Always execute tests in Step 4 |
| Silently deleting failing tests | Heal or report — never delete |


## Workflow Quick Reference

### Full Pipeline (default)

```
Step 1 — Test Planner:
  1. Read spec (requirements.md + design.md)
  2. Resolve STACK from steering/tech.md + project files
  3. Navigate live app via Playwright MCP — snapshot-first exploration
  4. Analyze user flows and map critical paths
  5. Design comprehensive scenarios (happy path + edge cases + negative)
  6. Save structured test plan to apps/<app>/e2e/specs/<feature>/test-plan.md

Step 2 — Exploratory Validation (Playwright MCP):
  7. mcp_playwright_browser_navigate → starting page (auto-launches browser)
  8. [if auth required] POST login → set session cookie via browser_run_code_unsafe
  9. mcp_playwright_browser_snapshot → verify selectors match test plan
  10. Execute critical happy paths, confirm state transitions
  11. Compile validation report — update test plan if mismatches found
  12. mcp_playwright_browser_close

Step 3 — Test Generator:
  11. Generate/update Page Object classes → Write/StrReplace to apps/<app>/e2e/pages/
  12. Generate spec files → Write/StrReplace to apps/<app>/e2e/specs/<feature>/

Step 4 — Test Executor & Healer:
  13. Run tests: npx playwright test <spec-path> --reporter=list
  14. If failures: classify, browser_navigate + browser_snapshot to inspect, fix, re-run (max 3 cycles)

Step 5 — Test Reporter:
  15. Generate coverage report with requirement traceability
  16. List files created/modified
  17. Flag remaining issues and recommendations
```

### Debug a Failing Test

```
1. Read the failing spec file
2. mcp_playwright_browser_navigate → failing page (auto-launches browser)
3. mcp_playwright_browser_snapshot → inspect DOM structure via accessibility tree
4. mcp_playwright_browser_take_screenshot → capture error state
5. Report: actual element refs found vs. what the test expected
6. mcp_playwright_browser_close
7. Fix the failing spec using Write/StrReplace/strReplace
8. Re-run test to verify fix
```

### Accessibility Audit

```
1. mcp_playwright_browser_navigate → page to audit
2. mcp_playwright_browser_snapshot → full semantic accessibility tree
3. mcp_playwright_browser_run_code_unsafe → inject axe-core and run analysis
4. Report violations with selector, impact, and WCAG criterion
5. mcp_playwright_browser_close
```

### API Mocking Test

```
1. mcp_playwright_browser_run_code_unsafe → page.route() to mock the API endpoint
2. mcp_playwright_browser_navigate → page that calls the API
3. mcp_playwright_browser_take_screenshot → verify frontend renders mock data
4. mcp_playwright_browser_snapshot → confirm expected UI text is present
5. mcp_playwright_browser_close
```


## Full-Stack E2E Pipeline Mode

When invoked as part of the Full-Stack E2E Pipeline (via `QA-Automator` skill), this agent operates in **spec-driven mode** and runs the full 5-step pipeline automatically:

1. **Test Planner** receives `requirements.md` and `design.md` from the orchestrator, extracts MUST requirements with UI interactions, and generates the test plan
2. **Exploratory Testing** launches the browser to validate assumptions against the live app
3. **Test Generator** creates POM classes and spec files for all testable requirements
4. **Test Executor & Healer** runs tests and auto-fixes up to 3 cycles
5. **Test Reporter** produces the coverage report mapped back to requirement IDs

This is Step 4 of the full-stack pipeline — runs after API tests (Bruno) are generated by `asdd-integration-tester`.

**CRITICAL RULES:**
- Always call `mcp_playwright_browser_close` at the end of every browser session. An incomplete session means the recording cannot be converted to `.spec.ts` files.
- Always call `mcp_playwright_browser_snapshot` before interacting with elements — use the `ref` values from the snapshot as `target` parameters.
- Never call a non-existent `browser_launch` — the browser auto-launches on the first `mcp_playwright_browser_navigate` call.
- You MUST write all test files to disk using `Write/StrReplace`. Reviewing, analyzing, or describing files without actually creating them is NOT acceptable.
- You MUST run the generated tests (Step 4). Generating tests without executing them is NOT acceptable.
- You MUST produce a test report (Step 5). The pipeline is not complete without a coverage summary.


## Output Checklist

- [ ] STACK fully resolved — zero assumed defaults
- [ ] Live app explored via `mcp_playwright_browser_snapshot` (snapshot-first, not screenshot-first)
- [ ] User flows analyzed — critical paths mapped for all user types
- [ ] Test plan includes happy path, edge cases, negative, and error scenarios
- [ ] Test plan saved to `apps/<app>/e2e/specs/<feature>/test-plan.md`
- [ ] Scenarios are independent — runnable in any order with fresh state
- [ ] Browser validation confirmed selectors match test plan
- [ ] Page Object files written to disk with `Write/StrReplace`
- [ ] Spec files written to disk with `Write/StrReplace`
- [ ] Tests executed via `npx playwright test`
- [ ] Failures healed (up to 3 cycles) using Playwright MCP for inspection
- [ ] Test report generated with requirement traceability
- [ ] `mcp_playwright_browser_close` called at end of every browser session
- [ ] No `waitForTimeout` anywhere
- [ ] Each test fully independent
- [ ] Error and empty states covered
- [ ] All requirement IDs referenced in test titles
