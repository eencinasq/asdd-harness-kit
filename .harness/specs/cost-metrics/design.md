# cost-metrics — Design (lite)

## Data flow

```
Claude Code Stop hook (payload.transcript_path, session_id)
  └─ verify-on-stop: after the verdict is written (ADR-001 of telemetry-emitters, fail-open)
       cost-lib.transcriptUsage(transcript) → cumulative usage per model for the session
       → `usage` attribute on the existing Stop `hook` span (slice_id/phase from telemetry-lib.attribute)
asdd status --metrics | --json | --html, asdd ui Pipeline, knowledge pipeline_status
  └─ pipeline-metrics.computePipelineMetrics → cost-lib.costFromSpans(spans, prices, runtimes) → metrics.cost
```

## Decisions

- **No schema change.** `attributes` is an open bag (`additionalProperties: true`); usage rides on the existing Stop
  `hook` span as `attributes.usage = { session_id, models: { <model>: { input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens, messages } } }`. Verify-on-Stop still emits exactly one span per exit.
- **Cumulative snapshots, delta attribution.** Each Stop records the session's cumulative usage. Metrics take, per
  session, consecutive snapshots in time order and attribute each per-model delta to the slice and phase of the
  snapshot's span (a decrease starts a new baseline). Totals equal the last snapshot per session. Snapshots outside
  the bounded read (last 1 MiB of `spans.jsonl`) are not seen; a session's first visible snapshot counts in full.
- **Transcript reading.** Only the path the hook payload names; must be a regular `.jsonl` file ≤ 64 MiB; assistant
  entries deduplicated by `message.id` (a streamed message repeats its usage once per content block). Any failure →
  no `usage` attribute; the span and the verdict are unchanged. The `usage` attribute is dropped if the span line
  would exceed the 4,096-byte limit (at most 8 models kept, largest first).
- **Unknown, never estimated.** Configured runtimes (`project.json` `runtimes`) and span runtimes without usage data
  are listed in `unknown_runtimes` and appear in `by_runtime` with `unknown: true` and `null` token and `usd` fields.
- **USD.** `usd = Σ tokens × price / 1e6` per model from `.harness/config/model-prices.json`
  (`{ "models": { "<model id>": { "input": n, "output": n, "cache_read": n, "cache_write": n } } }`, USD per million
  tokens). A model missing from the table, or no table, makes that row's `usd` `null`, and any `null` row makes the
  aggregate `usd` `null`. The kit ships no prices.
- **Single computation.** `cost-lib.mjs` is pure and imported by `pipeline-metrics.mjs`; the text block, the HTML card
  and table, the UI, and the knowledge server read the same `metrics.cost`.

## Contract (`metrics.cost`, REQ-004)

`source`, `totals {input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usd}`, `by_slice[{slice_id,…}]`,
`by_phase[{phase,…}]`, `by_model[{model,…}]`, `by_runtime[{runtime,…,unknown}]`, `unknown_runtimes`. Unattributed
spans use `slice_id: null` / `phase: null`. With no usage: zero totals, `usd: null`, empty arrays except
`by_runtime` (unknown runtimes), `unknown_runtimes` filled, `source: []`.

## New domain terms

None (usage snapshot is internal to cost-lib).

## ADRs

None beyond the decisions above (no schema or enum change).
