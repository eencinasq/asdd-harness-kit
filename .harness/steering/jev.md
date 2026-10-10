---
inclusion: always
---

# Jev (required)

TypeSafe System One is a required control. Key lives in `JEV_API_KEY`, never in git.

```json
{
  "enabled": true,
  "required": true,
  "apiKey": "",
  "endpoint": "https://api.typesafe.ai/v1",
  "fallbackPolicy": "fail-closed"
}
```

## One client, one gate module

| Call | Module |
|------|--------|
| `jevScore` / `jevNoul` / `jevChoice` | `.harness/scripts/jev-client.mjs` → `POST /v1/systemone` |
| Shape Up, EARS, slice, hill, gold-plating | `.harness/scripts/jev-gates.mjs` |
| Dangerous bash | `.harness/scripts/jev-command-gate.mjs` |
| Overlapping file scopes | `.harness/scripts/validators/features.mjs` (deterministic) |

```bash
node .harness/scripts/jev-client.mjs status
node .harness/scripts/jev-client.mjs health
node .harness/scripts/jev-gates.mjs health
```

## Thresholds

| Gate | Pass |
|------|------|
| Appetite | score ≥ 4 |
| Rabbit hole | prob_yes ≥ 0.80 |
| EARS | prob_yes ≥ 0.85 |
| Command | whitelist or prob_yes ≥ 0.80 |
| Gold-plating | noul ≥ 0.85 (WARN under that; FAIL if Jev unavailable) |
| Hill chart | score < 2 and timebox < 20% → circuit break |

`_unavailable` is never a pass. Override only with `# jev-override: accept` and a session note.

Session-loop gates (`verify-on-stop`, Cursor and Claude Code) run
`check-invariants.mjs --live`: a missing `JEV_API_KEY` blocks the session end.
CI without `JEV_API_KEY` skips live calls (non-live mode, WARN); `enabled` and
`required` must still be true.
