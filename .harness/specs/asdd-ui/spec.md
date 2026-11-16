# asdd-ui — Spec (lite)

## Intent

One local place for humans who do not live in the IDE (Tech Lead, PM). Today the pipeline HTML (`status --html`), the
spec-drift MCP App views, and knowledge queries are scattered and depend on MCP hosts (Cursor mounts views only under
~13 KB). Add `asdd ui`: a zero-dependency local Node HTTP server, read-only over `.harness/`, that aggregates those views
and refreshes on state changes (P5 roadmap, gap G18). Desktop packaging (Tauri) is explicitly out of scope.

Mapped: `cli/src/harness/ui-server*.mjs`, `cli/src/harness/commands.mjs`, `tools/spec-drift/ui/**` (reuse only), `README.md` (command row)

## Requirements

- **REQ-001.** The CLI shall provide `asdd ui [--port <n>]` that serves on `127.0.0.1` only and adds no runtime dependency.
- **REQ-002.** The UI shall show slices (registry/PROGRESS), the pipeline view, spec-drift results, open learning patterns, and a knowledge search.
- **REQ-003.** WHEN files under `.harness/state/` change, the open UI shall refresh without a manual reload.
- **REQ-004.** The server shall expose no endpoint that writes to the repository.

## Depends on

None. Unblocks: `ui-gate-decisions`, `ui-insights`.
