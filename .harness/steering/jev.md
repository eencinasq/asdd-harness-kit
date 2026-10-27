---
inclusion: always
---

# Jev (skill-scoped)

TypeSafe System One is **required only** for the `shape-up` and `product-delivery` skills.
Harness ASDD phases, invariants, command gates, and other skills must **not** call Jev.

Key lives in `JEV_API_KEY`, never in git.
Load order: real env → `.env.local` → `.env` (loader: `.harness/scripts/env-loader.mjs`).

```json
{
  "enabled": true,
  "required": false,
  "required_by": ["shape-up", "product-delivery"],
  "apiKey": "",
  "endpoint": "https://api.typesafe.ai/v1",
  "fallbackPolicy": "fail-closed"
}
```

## Who calls Jev

| Caller | Uses Jev? |
|--------|-----------|
| `shape-up` skill | **Required via MCP** — `jev_status` + `jev_shape_up_gates` |
| `product-delivery` skill | **Required via MCP** — `jev_status` + `jev_scope_choice` + `jev_ears_gate` |
| Harness invariants / verify-on-stop | No |
| Command shell gate | No (pattern allow/deny only) |
| Gold-plating validator | No |
| Other skills / ASDD agents | No |

## MCP tools (`jev-gate` server)

Prefer MCP over shell. Server: `.agents/mcp/jev-gate-server.mjs` (see `.agents/mcp/mcp.json`).

| Tool | Skill | Purpose |
|------|-------|---------|
| `jev_status` | both | Confirm key / optional health |
| `jev_shape_up_gates` | shape-up | Appetite + rabbit-hole |
| `jev_scope_choice` | product-delivery | Scope class in a bet: must_have / nice_to_have / reshape (never a backlog) |
| `jev_ears_gate` | product-delivery | Must-have outcome in an intent is observable (EARS) |
| `check_command_safety` | hooks | Pattern allow/deny (no System One) |

## Modules (library behind MCP)

| Call | Module |
|------|--------|
| `jevScore` / `jevNoul` / `jevChoice` | `.harness/scripts/jev-client.mjs` → `POST /v1/systemone` |
| Shape Up, scope, EARS, hill | `.harness/scripts/jev-gates.mjs` |
| Overlapping file scopes | `.harness/scripts/validators/features.mjs` (deterministic, no Jev) |

```bash
# Fallback only when MCP is unavailable
node .harness/scripts/jev-client.mjs status
node .harness/scripts/jev-gates.mjs health
```

## Thresholds (shape-up / product-delivery)

| Gate | Pass |
|------|------|
| Appetite | score ≥ 4 |
| Rabbit hole | prob_yes ≥ 0.80 |
| EARS | prob_yes ≥ 0.85 |
| Hill chart | score < 2 and timebox < 20% → circuit break |

Inside those two skills, `_unavailable` is never a pass. Override only with `# jev-override: accept` and a session note.

`check-invariants.mjs --live` does **not** require `JEV_API_KEY`.
