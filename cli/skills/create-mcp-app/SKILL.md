---
name: create-mcp-app
description: >-
  Builds an MCP App: an MCP tool linked to a bundled HTML view. Use when asked to create or scaffold an MCP App or add a
  UI to an MCP tool. Do NOT use for an MCP server without UI or a regular web page; or for testing app logic — use
  test-driven-development.
metadata:
  tier: leaf
---

# Create MCP App

Builds interactive UIs that run inside MCP-enabled hosts such as Claude Desktop. Every MCP App has two linked parts: a
**tool** (called by the model or host, returns data) and a **resource** (serves the bundled HTML view). The tool's
`_meta.ui.resourceUri` names the resource. Host calls tool → host renders the resource → server returns the result →
the view receives it. SDK detail (framework templates, API source files, advanced patterns, dependencies, handler
order, common mistakes, debugging): [`references/sdk-reference.md`](./references/sdk-reference.md).

**Operational boundary:** the app's project directory (`<app-dir>`); the SDK reference clone lives outside it, in
`$MCP_APPS_REF`, and is read-only.

## Preconditions

- `node --version` and `npm --version` exit 0, and the network reaches the npm registry and GitHub (`npm view
  @modelcontextprotocol/ext-apps version` prints a version).
- `MCP_APPS_REF` is set to a directory outside the project, for example
  `export MCP_APPS_REF="$(mktemp -d)/ext-apps"`.

## Input / Output Contract

- **Inputs:** `tool_contract` (`string`, what the model calls the tool for, its input schema, the data it returns,
  required); `view` (`string`, what the view shows and lets the user do, required); `framework` (`enum`, `react` |
  `vanillajs` | `vue` | `svelte` | `preact` | `solid`, default from the decision tree); `server` (`path`, an existing MCP
  server to extend, optional); `req_ids` (`string[]`, `^REQ-\d{3}$`, in an ASDD slice).
- **Outputs:** `app` (`directory`, `<app-dir>` with `server.ts`, the view source, `vite.config.ts` using `vite-plugin-singlefile`, and
  `package.json` scripts); `bundle` (`html`, one single-file HTML under `<app-dir>/dist/`).

## Execution Protocol

### Step 1: Pin the scope

- **Action:** write the tool contract and a one-paragraph view description; in a slice, the `REQ-NNN` each behavior serves.
- **Target:** the session (or the slice's design notes).
- **Assertion:** the tool's input schema and returned fields are named.

### Step 2: Choose the setup

- **Action:** pick framework and project context from the decision tree in the reference: join an existing MCP server or
  start a new one (transport stdio or HTTP).
- **Target:** `<app-dir>`.
- **Assertion:** framework and context are named.

### Step 3: Get the reference

- **Action:** `git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1
  https://github.com/modelcontextprotocol/ext-apps.git "$MCP_APPS_REF"` and pick `basic-server-<framework>`.
- **Target:** `$MCP_APPS_REF`.
- **Assertion:** `test -d "$MCP_APPS_REF/examples/basic-server-<framework>"` exits 0.

### Step 4: Register the tool and the resource

- **Action:** `npm install` the dependencies (never hand-write versions; the 2.x split SDK packages, no legacy
  `@modelcontextprotocol/sdk` v1); register the tool with `_meta.ui.resourceUri` and the resource serving the bundled
  HTML, with `_meta.ui.csp` / `_meta.ui.domain` in the resource's `contents[]`.
- **Target:** `<app-dir>/server.ts`, `<app-dir>/package.json`.
- **Assertion:** the server compiles and lists the tool.

### Step 5: Build the view

- **Action:** register every handler before `app.connect()`; return a text `content` fallback for hosts without UI;
  follow the host theme (host style variables or `applyDocumentTheme`); send errors to the model as `isError`.
- **Target:** the view source.
- **Assertion:** `npm run build` writes one HTML file.

### Step 6: Test in a host

- **Action:** `npm run build && npm run serve`, then in `$MCP_APPS_REF/examples/basic-host`:
  `npm install && SERVERS='["http://localhost:3001/mcp"]' npm run start` and open `http://localhost:8080`. basic-host is
  for local testing, not a guarantee of real host behavior.
- **Target:** the running server and basic-host.
- **Assertion:** a tool call renders the view with real data and no CSP or console errors.

Acceptance criteria of the finished app: the text `content` is useful without the UI; `resourceUri` matches a registered
resource that serves the bundle; every network request of the view is allowed by its CSP and nothing else is fetched;
handlers are registered before `connect()`; the view follows the host theme at the host's sizes; errors reach the model.

## Verification Gate

1. `npm run build` exits 0 and `ls <app-dir>/dist/*.html | wc -l` prints 1.
2. `grep -n "resourceUri" <app-dir>/server.ts` matches, and its URI equals the registered resource's.
3. `grep -c "@modelcontextprotocol/sdk\"" <app-dir>/package.json` prints 0 (no legacy v1 package).
4. In basic-host: the tool call renders, the console shows no CSP error, a forced error arrives as `isError`, and with
   the UI unavailable the text `content` alone answers. List any acceptance criterion that does not hold, with the
   reason, instead of claiming done.
5. Negative check: `git status --porcelain` lists no path outside `<app-dir>` (the SDK clone is outside the project).

## Escalation Gate

HALT when a Precondition fails (no network, no npm), when the SDK release and the templates disagree on an API, or when
the host needs a network origin the user has not approved for the CSP. Escalate as Context → Options → Recommendation →
Decision Needed; never widen the CSP to make an error go away.

## Handoff & Convergence

- **handoff → `test-driven-development`:** for the tool's data logic, tested apart from the view; passes `tool_contract`.
