# jev-gate-nest — Spec (lite)

## Intent

Move the zero-dependency `jev-gate` MCP server (`.agents/mcp/jev-gate-server.mjs`) to `tools/jev-gate/` and rebuild it
with NestJS and `@nestjs/mcp`, the same way as `tools/spec-drift/`. The gates stay in the harness scripts
(`.harness/scripts/jev-gates.mjs`, `jev-client.mjs`, `env-loader.mjs`, `command-gate.mjs`). The old server and its test
are removed; the jev module installs `tools/jev-gate` and registers `node tools/jev-gate/bin/jev-gate.mjs`.

## Requirements

- **REQ-001.** The jev-gate server shall expose `jev_status`, `jev_shape_up_gates`, `jev_ears_gate`, `jev_scope_choice`, and the deprecated `check_command_safety`, with the inputs and verdicts of the former server.
- **REQ-002.** When Jev is not configured, unavailable, or a gate is not ok, the server shall return a tool error with the JSON payload (fail closed).
- **REQ-003.** When `HARNESS_ROOT` is set, the server shall read the harness config and `.env` files from that directory.
- **REQ-004.** The jev module install shall ship `tools/jev-gate` (no tests, `node_modules`, or `dist`), migrate an existing `jev-gate` entry that points at the retired server, remove the retired file, and `--remove-modules=jev` shall remove `tools/jev-gate`.
