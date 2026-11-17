# asdd-ui — Tasks (lite)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

Single wave. Serial execution (one `in_progress` feature at a time). Owner: `cursor`.

## TASK-001 — Local `asdd ui` server (bind + read-only)

Stand up `ui-server.mjs` + CLI wiring so `asdd ui [--port <n>]` listens on `127.0.0.1` only with Node builtins; reject write methods with 405.

- **Files:** `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`, `cli/src/harness/commands.mjs` (entry deferred to slice end if needed for the command to resolve — register when first green), `cli/src/harness/ui/` (minimal shell stub)
- **REQ:** REQ-001, REQ-004
- **Verification:** `node --test cli/src/harness/ui-server.test.mjs`

## TASK-002 — Aggregate read views

Serve slices/PROGRESS, pipeline HTML (`renderPipelineHtml`), drift JSON (`runDrift`), open learning patterns, and knowledge search in the shell UI (light/dark + narrow).

- **Files:** `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`, `cli/src/harness/ui/**`
- **REQ:** REQ-002
- **Verification:** `node --test cli/src/harness/ui-server.test.mjs`

## TASK-003 — Live refresh + ship registration

`fs.watch` on `.harness/state/` → SSE `/events`; client refreshes without manual reload. Append shared registration (`commands.mjs`, `package.json` test entry, `README.md` row), regenerate `cli/versions.json` via `asdd kit versions`.

- **Files:** `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`, `cli/src/harness/ui/**`, `cli/src/harness/commands.mjs`, `package.json`, `cli/versions.json`, `README.md`
- **REQ:** REQ-003 (+ ship REQ-001 command surface)
- **Verification:** `node --test cli/src/harness/ui-server.test.mjs`
