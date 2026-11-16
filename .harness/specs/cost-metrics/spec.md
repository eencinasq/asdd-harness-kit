# cost-metrics — Spec (lite)

## Intent

Answer "what did this slice cost, and would another model/runtime pass the same gates cheaper?". `status --metrics`
measures flow (phases, durations) but not tokens or cost. Roll up token/cost spans per slice, phase, model, and
runtime (P5 roadmap, gap G17). Open question for Design: which runtimes expose token counts to hooks (Claude Code
transcript, Cursor, OpenCode) — runtimes without them report "unknown", never an estimate.

Mapped: `cli/src/harness/pipeline-metrics.mjs`, `cli/src/harness/harness-status.mjs`, `cli/src/harness/pipeline-html.mjs`

## Requirements

- **REQ-001.** `asdd status --metrics` shall report tokens and cost per slice and per phase when spans carry them.
- **REQ-002.** The report shall group by `model` and `runtime` so two configurations can be compared on the same slice kind.
- **REQ-003.** WHERE a runtime does not expose token counts, the report shall show `unknown` and shall not estimate.
- **REQ-004.** `--json` output shall include the same fields for `ui-insights`.

## Depends on

`telemetry-emitters`.
