# Jev wiring (required)

TypeSafe **System One** is a required control in this kit. Steering and thresholds: [`.harness/steering/jev.md`](../.harness/steering/jev.md).

## Pipeline

```text
[ idea ]
    │
    ▼
1. SHAPE UP
   jevScore  → appetite fit (pass ≥ 4)
   jevNoul   → rabbit-hole guard (pass ≥ 0.80)
    │
    ▼
2. PRODUCT DELIVERY
   EARS REQ-* drafts
   jevNoul   → ambiguity (pass ≥ 0.85, or `# jev-override: accept`)
   jevChoice → slice class (mvp | v1 | v2 | backlog)
    │
    ▼
3. EXTERNAL TRACKERS (optional projection)
   Linear / Jira / GitHub Issues hold the human bet
   Overlapping file scopes → `.harness/scripts/validators/features.mjs`
   (not a Jev call)
    │
    ▼
4. ASDD + HARNESS
   jev-command-gate.mjs → dangerous bash (whitelist, else noul ≥ 0.80)
   Hook-wired:          Cursor beforeShellExecution / Claude Code PreToolUse (fail-closed)
   Agent loop            → code, tests, session files, sync-state
   check-invariants.mjs  → harness state + gold-plating noul on in-progress diffs
   verify-on-stop.mjs    → check-invariants --live at session end (missing key = FAIL)
   hillChartGate         → circuit break if score < 2 and timebox < 20%
    │
    ▼
[ verified code ]
```

`_unavailable` is never a pass. Do not invent fallback scores that look like success.

## Commands

```bash
export JEV_API_KEY="…"                 # never commit; project.json apiKey stays ""
node .harness/scripts/jev-client.mjs status
node .harness/scripts/jev-gates.mjs health
node .harness/scripts/check-invariants.mjs          # structural (non-live) mode
node .harness/scripts/check-invariants.mjs --live   # session-gate mode: missing key = FAIL
node --test .harness/scripts/jev-client.test.mjs .harness/scripts/jev-command-gate.test.mjs .agents/mcp/jev-gate-server.test.mjs
```

| Script | Role |
|--------|------|
| `jev-client.mjs` | Only HTTP client: `POST {endpoint}/systemone` |
| `jev-gates.mjs` | Shape Up, EARS, slice, hill, gold-plating |
| `jev-command-gate.mjs` | Command safety policy + runtime hook entrypoint (Cursor `beforeShellExecution`, Claude Code `PreToolUse`; protocol auto-detected from the stdin payload) |
| `jev-gate-server.mjs` (.agents/mcp) | Optional zero-dependency MCP stdio adapter exposing the same policy as the `check_command_safety` tool |

## Config

`.harness/config/project.json`:

```json
"jev": {
  "enabled": true,
  "required": true,
  "apiKey": "",
  "endpoint": "https://api.typesafe.ai/v1",
  "fallbackPolicy": "fail-closed"
}
```

`check-project-config.mjs` fails if `enabled`/`required` are not true, or if `apiKey` is stored in the file.

**Live vs non-live mode.** Session-loop gates (`verify-on-stop` on Cursor and Claude Code) always run `check-invariants.mjs --live`: without `JEV_API_KEY` the run FAILs and the session cannot close — this is the "Jev is required" non-negotiable, enforced. Ad-hoc structural checks and CI run non-live by default: without a key they WARN (`JEV_API_KEY not set; live Jev skipped`) and skip live calls so CI can pass with `enabled`/`required` structurally true. Override the default with `--live` or `HARNESS_JEV_LIVE=1`.

## MCP

`.agents/mcp/jev-gate-server.mjs` is a stdio MCP adapter around the same policy module (`jev-command-gate.mjs`). It is implemented dependency-free (hand-rolled JSON-RPC over stdio) — no `@modelcontextprotocol/sdk` required — and is registered enabled in `.agents/mcp/mcp.json`. Servers with `"enabled": false` are skipped by `sync-runtime-mcp.cjs` projections. Hook enforcement (Cursor/Claude) calls `jev-command-gate.mjs` directly; the MCP tool serves runtimes that prefer native MCP gating. Protocol tests: `node --test .agents/mcp/jev-gate-server.test.mjs`.

## Skills

There are no separate `jev-*` skills. Required gates are sections in:

- [`.agents/skills/shape-up/SKILL.md`](../.agents/skills/shape-up/SKILL.md)
- [`.agents/skills/product-delivery/SKILL.md`](../.agents/skills/product-delivery/SKILL.md)
