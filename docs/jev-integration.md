# Jev wiring (skill-scoped)

TypeSafe **System One** is required only for **`shape-up`** and **`product-delivery`**.
Harness ASDD phases, invariants, and other skills must **not** call Jev.

Steering and thresholds: [`.harness/steering/jev.md`](../.harness/steering/jev.md).

## Pipeline

```text
[ idea ]
    │
    ▼
1. SHAPE UP  (Jev MCP required)
   jev_status
   jev_shape_up_gates  → appetite score (≥ 4) + rabbit-hole noul (≥ 0.80)
    │
    ▼
2. PRODUCT DELIVERY  (Jev MCP required)
   EARS REQ-* drafts
   jev_status
   jev_ears_gate       → ambiguity (pass ≥ 0.85, or `# jev-override: accept`)
   jev_slice_choice    → slice class (mvp | v1 | v2 | backlog)
    │
    ▼
3. EXTERNAL TRACKERS (optional projection)
   Linear / Jira / GitHub Issues hold the human bet
   Overlapping file scopes → `.harness/scripts/validators/features.mjs`
   (not a Jev call)
    │
    ▼
4. ASDD + HARNESS  (no Jev)
   jev-command-gate.mjs → dangerous bash (pattern allow/deny only)
   Hook-wired:          Cursor beforeShellExecution / Claude Code PreToolUse (fail-closed)
   Agent loop            → code, tests, session files, sync-state
   check-invariants.mjs  → harness state (no System One)
   verify-on-stop.mjs    → check-invariants --live (does not require JEV_API_KEY)
    │
    ▼
[ verified code ]
```

Inside shape-up / product-delivery, `unavailable` is never a pass. Do not invent fallback scores that look like success.

## MCP first

Prefer the **`jev-gate` MCP** (`.agents/mcp/jev-gate-server.mjs`):

| Tool | Skill |
|------|--------|
| `jev_status` | both |
| `jev_shape_up_gates` | shape-up |
| `jev_ears_gate` | product-delivery |
| `jev_slice_choice` | product-delivery |
| `check_command_safety` | hooks (pattern only; no System One) |

Shell fallback only when MCP is unavailable:

```bash
export JEV_API_KEY="…"                 # or .env / .env.local — never commit; project.json apiKey stays ""
node .harness/scripts/jev-client.mjs status
node .harness/scripts/jev-gates.mjs health
node --test .harness/scripts/jev-client.test.mjs .harness/scripts/jev-command-gate.test.mjs .agents/mcp/jev-gate-server.test.mjs
```

| Script | Role |
|--------|------|
| `jev-client.mjs` | Only HTTP client: `POST {endpoint}/systemone` |
| `jev-gates.mjs` | Shape Up, EARS, slice, hill (library behind MCP) |
| `jev-command-gate.mjs` | Pattern command safety + runtime hook entrypoint |
| `jev-gate-server.mjs` (.agents/mcp) | MCP tools for skills + `check_command_safety` |

## Config

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

`check-invariants.mjs --live` does **not** require `JEV_API_KEY`. Set the key when running shape-up or product-delivery.
