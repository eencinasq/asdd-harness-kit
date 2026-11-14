# asdd-p4 — Design (lite)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/tracker-sync-lib.mjs` | Plan builder + local apply receipt |
| `cli/src/harness/tracker-sync-lib.test.mjs` | Fixtures |
| `cli/src/harness/tracker-sync.mjs` | CLI |
| `cli/skills/external-trackers/SKILL.md` | Point Step 4 at `asdd tracker-sync` |
| `cli/src/harness/verify-on-stop.mjs` | Honor `stop.mode` / `HARNESS_STOP_MODE` |
| `cli/src/harness/stop-mode.mjs` | Resolve advisory vs fail_closed |
| `cli/src/harness/stop-mode.test.mjs` | Unit tests |
| `cli/src/harness/check-project-config.mjs` | Validate `stop.mode` |
| `.harness/config/project.schema.json` + scaffold | `stop`, `capabilities.spec_as_source` |
| `cli/src/harness/spec-source-lib.mjs` | Opt-in REQ inventory |
| `cli/src/harness/spec-source-lib.test.mjs` | Fixtures |
| `cli/src/harness/spec-source.mjs` | CLI |
| `cli/docs/guides/spec-as-source.md` | Experimental guide |
| `cli/src/harness/commands.mjs` / `cli/README.md` / ROADMAP / `package.json` | Wire-up |

## Domain terms

- **tracker-sync plan** — deterministic list of outbound tracker actions derived from harness state
- **advisory Stop** — check still runs; session is not blocked
- **spec-as-source (pilot)** — opt-in inventory of REQs vs implementation; not default SoT

## ADRs

- **ADR (local):** Tracker MCP writes stay in the skill/human path; the CLI only plans + logs receipts so CI can test without credentials.
- **ADR (local):** Spec-as-source stays behind `capabilities.spec_as_source` so the kit does not become Tessl-default (ROADMAP §6).
- **ADR (local):** P4.2 Cencosud presets deferred to a later kit version.
