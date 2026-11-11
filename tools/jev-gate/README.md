# jev-gate

An MCP server, built with NestJS and `@nestjs/mcp` like [`spec-drift`](../spec-drift/README.md), that gives people in
chat TypeSafe **System One** (Jev) gates for Shape Up and Product Delivery: appetite, rabbit holes, scope choice, and
EARS quality. **Jev is not part of the harness or the ASDD pipeline**: no `asdd` command, skill, agent, or hook calls
it, and `asdd install` installs nothing of it. In the pipeline, those gates are decided by a human (`decided_by`); a
person who wants a second opinion asks this server in chat.

The gates live here (`src/jev/gates/`: `jev-client.mjs`, `jev-gates.mjs`). Only the env loader and the pattern-only
command check are vendored from the kit's `cli/src/harness` (`src/harness/`).

## Tools

| Tool                   | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `jev_status`           | Is Jev usable (`JEV_API_KEY` set)? `health: true` also pings System One                       |
| `jev_shape_up_gates`   | Appetite `jevScore` + rabbit-hole `jevNoul` for a pitch (object or text, optional `appetite`) |
| `jev_ears_gate`        | EARS observability `jevNoul` for one requirement                                              |
| `jev_scope_choice`     | `must_have` \| `nice_to_have` \| `reshape` for a scope                                        |
| `check_command_safety` | **Deprecated** pattern allow/deny check (no Jev); hooks use `asdd gate`                       |

Fail closed: a missing key, an unavailable judge, or `ok: false` is a tool error with the JSON
payload (`unavailable`, `thresholds`), never a pass. `.env` / `.env.local` in `HARNESS_ROOT` are re-read on every call,
because MCP clients do not pass the shell environment.

## Pass rules

| Gate        | Pass                                        |
| ----------- | ------------------------------------------- |
| Appetite    | score ≥ 4                                   |
| Rabbit hole | prob_yes ≥ 0.80                             |
| EARS        | prob_yes ≥ 0.85                             |
| Hill chart  | score < 2 and timebox < 20% → circuit break |

`unavailable` is never a pass. The verdict is advice for the people deciding the gate; record their decision
(`decided_by`) in the pitch, scope map, or intent as the skills describe.

## Get it

Jev is not an installable module: `asdd install` installs nothing of it, and the npm package does not include it. To use
it, clone (or copy) the kit repo and run the server from there:

```bash
git clone https://github.com/eencinasq/asdd-harness-kit.git
cd asdd-harness-kit/tools/jev-gate
nvm use && pnpm install && pnpm build
```

Then register it in your MCP client with the absolute path to `bin/jev-gate.mjs`, and point `HARNESS_ROOT` at the
project whose `.env` / `.env.local` hold `JEV_API_KEY`:

```json
{
	"mcpServers": {
		"jev-gate": {
			"type": "stdio",
			"command": "node",
			"args": ["/path/to/asdd-harness-kit/tools/jev-gate/bin/jev-gate.mjs"],
			"env": { "HARNESS_ROOT": "/path/to/your-project" }
		}
	}
}
```

## Run

```bash
nvm use && pnpm install && pnpm build    # once (Node >= 24.22.1)
node bin/jev-gate.mjs                    # stdio (what mcp.json launches)
node bin/jev-gate.mjs --http             # Streamable HTTP on http://127.0.0.1:3011/mcp (+ GET /health)
```

The kit registers it in `.agents/mcp/mcp.json` as `node tools/jev-gate/bin/jev-gate.mjs`. Until it is built, the
launcher prints the build command on stderr and exits.

## Configuration

| Variable              | Default              | Purpose                                                                   |
| --------------------- | -------------------- | ------------------------------------------------------------------------- |
| `HARNESS_ROOT`        | working directory    | Repo whose `.env` / `.env.local` are read for the key                     |
| `JEV_API_KEY`         | —                    | Required (env, `.env`, `.env.local`); never committed                     |
| `JEV_ENDPOINT`        | System One           | Override the Jev API endpoint                                             |
| `PORT` / `HOST`       | `3011` / `127.0.0.1` | HTTP transport                                                            |
| `MCP_API_KEY`         | —                    | HTTP shared secret (≥ 16 chars); **required** when `HOST` is not loopback |
| `MCP_ALLOWED_ORIGINS` | —                    | Extra browser origins allowed on `/mcp` (comma-separated)                 |

## Develop

```bash
pnpm typecheck && pnpm lint && pnpm test   # e2e (in-memory + stdio) and the System One client (test/jev-client.test.mjs)
```

```
src/
├── main.ts           bootstrap: chdir HARNESS_ROOT, then HTTP (/mcp, /health) or --stdio
├── app.module.ts     Config + MCP + JevModule, MCP error interceptor
├── config/           zod-validated environment
├── common/           HTTP guards (loopback, API key), MCP error interceptor
├── health/           GET /health
├── harness/          GENERATED copies of the env loader and command gate (see below)
└── jev/              jev.tools.ts (MCP) → jev.service.ts → harness-libs.ts → gates/ (jev-gates.mjs, jev-client.mjs)
```

`src/harness/` is generated by the kit's `asdd kit vendor` from `cli/src/harness`: never edit it here; edit the source and rerun it (`npm test` in the kit fails while a copy is stale).
