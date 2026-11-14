# asdd-p2 — Design (lite)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/init-slice.mjs` | `--hotfix` preset; start at implementation; stub feature |
| `cli/src/harness/sync-state.mjs` | `hotfix` in `SLICE_MODES`; amend resume in `deriveStatus`; escalation for hotfix |
| `cli/src/harness/amend-slice.mjs` | New: reopen DONE slice + amendment file |
| `cli/src/harness/commands.mjs` | Register `slice amend`; help for `--hotfix` |
| `cli/src/harness/validators/*` | Accept `hotfix`; serial like lite |
| `cli/src/harness/harness-status.mjs` | Uphill hill section |
| `cli/src/harness/check-invariants.mjs` | Late-uphill WARN |
| `cli/scaffold/features/feature.schema.json` + `.harness/features/feature.schema.json` | Optional `hill` |
| `cli/steering/asdd-lite.md` | Document hotfix + amend |
| `cli/README.md` | Commands |
| `docs/ASDD-ROADMAP.md` | P2 status |
| `package.json` | New tests |

## Domain terms

- **hotfix** — slice preset for ≤1-file bugfix; feature + evidence only
- **amend** — reopen a DONE slice with a delta note, no new pitch
- **hill** — Shape Up progress: `uphill` (unknowns) vs `downhill` (execution)

## ADRs

- **ADR (local):** `hotfix` is a first-class `mode` (not a parallel `preset` field) so validators and `deriveMode` stay single-path; escalate still moves hotfix → escalated.
