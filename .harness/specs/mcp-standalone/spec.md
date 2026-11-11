# mcp-standalone — Spec (lite)

## Intent

The MCP servers under `tools/` (`spec-drift`, `jev-gate`, `knowledge`) shall run on their own: no runtime import of
`.harness/scripts` (or `scripts/`) from the project. The harness libraries they share with the CLI are copied into
each `tools/<name>/src/harness/` by the kit's `scripts/vendor-harness-libs.mjs` and bundled into `dist`, so chat and
Verify-on-Stop / CI still run the same logic. The servers read only the project's data under `.harness/`.

## Requirements

- **REQ-001.** The spec-drift, jev-gate, and knowledge servers shall answer their tools for a `HARNESS_ROOT` that has no `.harness/scripts` directory.
- **REQ-002.** The servers shall not read `HARNESS_SCRIPTS_DIR` or load modules from the project at runtime, except project-owned spec-compliance adapters (`.agents/mcp/adapters`, enabled module adapters).
- **REQ-003.** When a vendored copy differs from its `.harness/scripts` source, `node scripts/vendor-harness-libs.mjs --check` shall exit non-zero, and `npm test` and CI shall run it.
- **REQ-004.** A vendored copy shall not contain the source's CLI block, so running a server bundle directly never runs a harness CLI.
