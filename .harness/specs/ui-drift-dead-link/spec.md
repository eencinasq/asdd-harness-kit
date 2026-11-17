# ui-drift-dead-link — Spec (hotfix)

## Intent

The `asdd ui` Drift view links to `/vendor/spec-drift/audit-dashboard.html`, served from `tools/spec-drift/dist`. That
page is an MCP App: it renders only when an MCP host sends it a tool result over `postMessage`, so in a plain browser
it stays on "Waiting for the tool result…" forever. Remove the link and the `/vendor/spec-drift/` route that only
served it; the Drift view already lists the findings from `/api/drift`. Embedding the MCP App would need the
`ext-apps` host bridge and is out of scope.

Mapped: `cli/src/harness/ui/app.js`, `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`

## Requirements

- **REQ-001.** The Drift view shall not link to a page that cannot render without an MCP host.
- **REQ-002.** `asdd ui` shall answer 404 for `/vendor/spec-drift/…`.
