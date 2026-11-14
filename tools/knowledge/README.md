# knowledge

The `knowledge` MCP server of the asdd-harness-kit (formerly `.agents/mcp/knowledge-server.mjs`), built with NestJS and
`@nestjs/mcp` like [`spec-drift`](../spec-drift/README.md) and [`jev-gate`](../jev-gate/README.md). It serves the
squad's process memory: the generated knowledge index and the self-improving harness's learning patterns.

The index (`.harness/knowledge/`) is written by `cli/src/harness/sync-knowledge.mjs` (every `asdd sync` run) and
read through the harness's own `knowledge-store.mjs` (SQLite built into Node, exact cosine for semantic search, else
JSONL), vendored into `src/harness/` and bundled, so the server never drifts from it and needs no `cli/src/harness`. Files under `.harness/` stay the source of truth. Usage per phase:
[`.harness/steering/knowledge.md`](../../.harness/steering/knowledge.md).

## Tools

| Tool                 | Purpose                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge_search`   | `query`, `k` (1-25), `slice_id`: semantic search when the index has vectors, else lexical                                                                     |
| `knowledge_trace`    | Breadth-first walk from a node id (`req:<slice>:REQ-001`, `feature:…`, `file:…`), `depth` 1-4                                                                 |
| `knowledge_slice`    | One slice: spec docs, requirements, acceptance criteria, features, session count, log entries                                                                 |
| `knowledge_status`   | Backend (`sqlite` / `jsonl`), counts, `generated_at`, search mode, and `warnings` when degraded                                                               |
| `knowledge_patterns` | Learning patterns (LP-\*), proposals, failure signatures; computed live, needs no index (`status`)                                                            |
| `pipeline_status`    | ASDD pipeline adoption metrics (same object as `asdd status --json`): lite share, escalation rate, phase medians, stop-FAIL counts, open patterns. Read-only. |

Degradations are reported, never hidden: a stale `knowledge.db` (JSONL served), an index with vectors but no embeddings
endpoint, or a failed query embedding (lexical fallback) all appear in `warnings` and on stderr. Without an index, the
index tools are errors that name `asdd knowledge sync`.

## Run

```bash
nvm use && pnpm install && pnpm build    # once (Node >= 24.22.1)
node bin/knowledge.mjs                   # stdio (what mcp.json launches)
node bin/knowledge.mjs --http            # Streamable HTTP on http://127.0.0.1:3012/mcp (+ GET /health)
```

The kit registers it in `.agents/mcp/mcp.json` as `node tools/knowledge/bin/knowledge.mjs`. Until it is built, the
launcher prints the build command on stderr and exits.

## Configuration

| Variable                     | Default              | Purpose                                                                   |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `HARNESS_ROOT`               | working directory    | Harness repo; the server `chdir`s there and reads `.harness/knowledge/`   |
| `KNOWLEDGE_EMBEDDINGS_URL`   | —                    | OpenAI-compatible embeddings endpoint for query vectors                   |
| `KNOWLEDGE_EMBEDDINGS_MODEL` | —                    | Model name; must match the one the index was built with                   |
| `KNOWLEDGE_EMBEDDINGS_KEY`   | —                    | Bearer token for the endpoint                                             |
| `PORT` / `HOST`              | `3012` / `127.0.0.1` | HTTP transport                                                            |
| `MCP_API_KEY`                | —                    | HTTP shared secret (≥ 16 chars); **required** when `HOST` is not loopback |
| `MCP_ALLOWED_ORIGINS`        | —                    | Extra browser origins allowed on `/mcp` (comma-separated)                 |

`KNOWLEDGE_EMBEDDINGS_*` are read from the environment, then `.env` / `.env.local` in `HARNESS_ROOT`, on every call,
because MCP clients do not pass the shell environment.

## Develop

```bash
pnpm typecheck && pnpm lint && pnpm test   # e2e: fixture → index → in-memory + stdio MCP calls (no cli/src/harness)
```

```
src/
├── main.ts           bootstrap: chdir HARNESS_ROOT, then HTTP (/mcp, /health) or --stdio
├── app.module.ts     Config + MCP + KnowledgeModule, MCP error interceptor
├── config/           zod-validated environment
├── common/           HTTP guards (loopback, API key), MCP error interceptor
├── health/           GET /health
├── harness/          GENERATED copies of the cli/src/harness index + learning libs (see below)
└── knowledge/        knowledge.tools.ts (MCP) → knowledge.service.ts → harness-libs.ts → src/harness/knowledge-query.mjs
```

`src/harness/` is generated by the kit's `asdd kit vendor` from `cli/src/harness`: never edit it here; edit the source and rerun it (`npm test` in the kit fails while a copy is stale).
