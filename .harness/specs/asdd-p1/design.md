# asdd-p1 — Design (lite)

## What changes

| Path | Change |
|------|--------|
| `cli/skills/asdd-status/SKILL.md` | Thin skill → `asdd status` / `--metrics` |
| `cli/skills/asdd-next/SKILL.md` | Thin skill → pick next dependency-ready feature via `asdd status` + features JSON |
| `cli/skills/asdd-implement/SKILL.md` | Thin skill → implement current feature; `asdd sync` / `asdd check` |
| `cli/skills/asdd-converge/SKILL.md` | Thin skill → `asdd converge` then mark passing |
| `cli/src/harness/converge-lib.mjs` | Pure converge checks |
| `cli/src/harness/converge-lib.test.mjs` | Fixtures |
| `cli/src/harness/converge.mjs` | CLI entry |
| `cli/src/harness/check-invariants.mjs` | Include converge FAILs for passing features |
| `cli/src/harness/harness-status.mjs` | `--html` dashboard |
| `cli/src/harness/pipeline-html.mjs` | HTML renderer |
| `cli/src/harness/commands.mjs` | Register `converge`; help text |
| `cli/src/kit/vendor.mjs` | Vendor `pipeline-metrics` (+ deps) into knowledge |
| `tools/knowledge/src/knowledge/*` | `pipeline_status` tool |
| `cli/steering/skills.md` / `.harness/steering/skills.md` | Regenerated via `asdd skills-index --write` |
| `docs/ASDD-ROADMAP.md` | P1 status notes |
| `package.json` | New unit tests |

## Domain terms

none

## ADRs

- **ADR (local):** P1.2 ships CLI HTML + knowledge JSON tool first; a full MCP App (`ext-apps`) in knowledge is deferred — knowledge lacks `@modelcontextprotocol/ext-apps` today.
