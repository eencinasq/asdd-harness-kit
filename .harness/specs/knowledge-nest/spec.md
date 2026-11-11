# knowledge-nest — Spec (lite)

## Intent

Move the zero-dependency `knowledge` MCP server (`.agents/mcp/knowledge-server.mjs`) to `tools/knowledge/` and rebuild
it with NestJS and `@nestjs/mcp`, the same way as `tools/spec-drift/` and `tools/jev-gate/`. The index and the learning
loop stay in the harness scripts (`knowledge-store.mjs`, `learning-lib.mjs`, `env-loader.mjs`). The old server and its
MCP cases in `sync-knowledge.test.mjs` are removed; the installer ships `tools/knowledge` and registers
`node tools/knowledge/bin/knowledge.mjs`.

## Requirements

- **REQ-001.** The knowledge server shall expose `knowledge_search`, `knowledge_trace`, `knowledge_slice`, `knowledge_status`, and `knowledge_patterns`, with the inputs and result shapes of the former server.
- **REQ-002.** When the index is missing, stale, or the query cannot be embedded, the server shall report it (tool error naming `sync-knowledge.mjs`, or `warnings` and stderr), never hide it.
- **REQ-003.** When `HARNESS_ROOT` is set, the server shall read the index, learning state, and `.env` files from that directory.
- **REQ-004.** The install shall ship `tools/knowledge` (no tests, `node_modules`, or `dist`), migrate an existing `knowledge` entry that points at the retired server, and remove the retired file.
