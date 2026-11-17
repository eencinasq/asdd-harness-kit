# cost-metrics — Spec (lite)

## Intent

Answer "what did this slice cost, and would another model/runtime pass the same gates cheaper?". `status --metrics`
measures flow (phases, durations) but not tokens or cost. Roll up token/cost spans per slice, phase, model, and
runtime (P5 roadmap, gap G17). Design answer: Claude Code exposes per-message `usage` in the transcript its Stop hook names (`transcript_path`); Cursor and the other runtimes expose nothing a hook can read, so they report `unknown`, never an estimate. USD comes only from a project-owned price table (`.harness/config/model-prices.json`); the kit ships no prices.

Mapped: `cli/src/harness/cost-lib.mjs` (new), `cli/src/harness/cost-lib.test.mjs` (new), `cli/src/harness/pipeline-metrics.mjs`, `cli/src/harness/pipeline-metrics.test.mjs`, `cli/src/harness/harness-status.mjs`, `cli/src/harness/pipeline-html.mjs`, `cli/src/harness/pipeline-html.test.mjs`, `cli/src/harness/verify-on-stop.mjs`, `cli/src/harness/verify-on-stop.test.mjs`, `package.json` (`test` script entry), `tools/knowledge/src/harness/pipeline-metrics.mjs` and `tools/knowledge/src/harness/cost-lib.mjs` (vendored copies, `asdd kit vendor`)

## Requirements

- **REQ-001.** `asdd status --metrics` shall report tokens and cost per slice and per phase when spans carry them.
- **REQ-002.** The report shall group by `model` and `runtime` so two configurations can be compared on the same slice kind.
- **REQ-003.** WHERE a runtime does not expose token counts, the report shall show `unknown` and shall not estimate.
- **REQ-004.** `--json` output shall include the same fields for `ui-insights`.

## Depends on

`telemetry-emitters`.
