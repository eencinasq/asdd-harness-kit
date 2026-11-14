# asdd-p0 — Design (lite)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/pipeline-metrics.mjs` | Pure compute of pipeline metrics from registry, sessions, learning summaries |
| `cli/src/harness/pipeline-metrics.test.mjs` | Synthetic fixtures (REQ-002) |
| `cli/src/harness/harness-status.mjs` | `--metrics` / `--json` flags |
| `cli/src/harness/commands.mjs` | Register `init-flow`; extend status help |
| `cli/src/harness/init-flow.mjs` | Brownfield 15-minute happy path |
| `cli/src/harness/init-flow.test.mjs` | Temp-dir e2e for init-flow |
| `cli/src/main.mjs` | Help line for `init-flow` if needed via HARNESS_COMMANDS |
| `cli/docs/guides/spec-kit-to-asdd.md` | Spec Kit → ASDD map |
| `cli/README.md` | Document `status --metrics` and `init-flow` |
| `package.json` | Include new unit tests in `npm test` |

## Domain terms

none new — uses existing slice / session / learning vocabulary.

## ADRs

none — CLI surface only; no SoT change beyond new command scripts.
