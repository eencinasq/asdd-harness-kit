# asdd-ui — Design (lite)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/ui-server.mjs` | New: local read-only HTTP server (`node:http` / `node:fs` only), bind `127.0.0.1`, CLI entry for `asdd ui [--port <n>]`. |
| `cli/src/harness/ui-server.test.mjs` | New: node:test coverage for REQ-001…REQ-004 (bind, routes, SSE, no writes). |
| `cli/src/harness/ui/**` | New: static shell (HTML/CSS/JS) — slices, pipeline embed, drift, learning, knowledge search; light/dark + narrow widths. |
| `cli/src/harness/commands.mjs` | Append-only: one `ui` command entry (end of slice). |
| `package.json` | Append-only: one `ui-server.test.mjs` entry in the `test` script (end of slice). |
| `cli/versions.json` | Regenerated via `asdd kit versions` after shipping files (never hand-edit). |
| `README.md` | Append-only: one row in the command table (end of slice). |

**Read-only reuse (do not edit):** `cli/src/harness/pipeline-html.mjs` (`renderPipelineHtml`), `tools/spec-drift/ui/**` and built `tools/spec-drift/dist/*-dashboard.html` for embedding/serving.

## Approach

Delivery adapter only — no new domain concepts. The server prefers existing libs/commands over re-deriving state:

| UI surface | Source |
|------------|--------|
| Slices / PROGRESS | `.harness/state/registry.json`, `.harness/PROGRESS.md` (read) |
| Pipeline view | `renderPipelineHtml({ root })` from `pipeline-html.mjs` |
| Metrics JSON | `computePipelineMetrics({ root })` (same as `status --metrics --json`) |
| Spec-drift | `runDrift({ root, … })` → JSON; optionally serve dist dashboards as static |
| Learning patterns | `readPatterns(root)` / learn JSON shape |
| Knowledge search | `search(root, query, { k })` from `knowledge-query.mjs` |
| Live refresh | `fs.watch` on `.harness/state/` → Server-Sent Events (`/events`) |

HTTP shape (all GET unless noted):

- `GET /` — shell from `cli/src/harness/ui/`
- `GET /api/status` — slices + metrics JSON
- `GET /api/pipeline` — HTML from `renderPipelineHtml`
- `GET /api/drift` — drift JSON
- `GET /api/learn` — open patterns JSON
- `GET /api/knowledge?q=` — search hits JSON
- `GET /events` — `text/event-stream` (state change pings)
- Static under `/ui/` and optional `/vendor/spec-drift/` (dist HTML, read-only)
- Any non-GET → `405`; no handler writes under the repo

Default port: a fixed unused default (e.g. `7474`) overrideable with `--port`. Print the URL on start; process stays until SIGINT.

## Domain placement

Harness **delivery** layer (`cli/` HTTP/CLI adapter) over existing `*-lib.mjs` / status helpers. No new entities in `docs/architecture/domain-model.md`.

## Domain impact

none

## ADRs

None — localhost Node HTTP with builtins is constrained by the slice intent; Tauri remains out of scope.

## Risks

| Risk | Mitigation |
|------|------------|
| `fs.watch` flaky / noisy | Debounce; SSE sends a light `reload` event; client re-fetches APIs |
| Accidental write surface | Tests assert 405 for POST/PUT/PATCH/DELETE; no fs.write* in server module |
| Spec-drift MCP HTML expects host tool push | Primary path is our JSON + simple render; dist HTML is optional static reuse |
| Parallel P5 registration conflicts | Touch `commands.mjs` / `package.json` / `README.md` only at slice end, append-only |
