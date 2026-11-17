# cost-metrics — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** `asdd status --metrics` shall report tokens and cost per slice and per phase when spans carry them.
- **REQ-002.** The report shall group by `model` and `runtime` so two configurations can be compared on the same slice kind.
- **REQ-003.** WHERE a runtime does not expose token counts, the report shall show `unknown` and shall not estimate.
- **REQ-004.** `--json` output shall include the same fields for `ui-insights`.
