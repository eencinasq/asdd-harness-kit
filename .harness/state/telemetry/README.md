# Harness Telemetry (contract-only — Phase 1)

This directory holds the ratified telemetry contract for the ASDD harness.
Normative source: proposal `docs/knowledge-base/profiling-proposals/v2.md` (CONVERGED —
`v2.review.md`). Phase 1 lands the schema and this file only — **no emitters,
no instrumentation, no span data yet** (all wiring is Phase-2, guardrailed
`AR-1…AR-10`).

## Layout

| Path | Status | Role |
| --- | --- | --- |
| `telemetry.schema.json` | committed | Span grammar — JSON Schema draft-07, `schema_version: "1.0"` |
| `README.md` | committed | This file |
| `spans.jsonl` | Phase 2, gitignored | Single canonical append-only stream — one span per LF-terminated line ≤4,096 bytes, one `write()`/`O_APPEND` per span |
| `slices/<id>/profiling.json` | Phase 2, generated + gitignored | Per-slice rollup consumed by `harness-profile.mjs` |

## Contract in brief

- **Span model (OTel-derived):** `trace_id`/`span_id`/`parent_span_id`,
  `kind ∈ {phase, turn, command, test, sensor, hook, sync, subagent, tool}`,
  ISO timestamps, `duration_ms`, `status ∈ {OK, ERROR, TIMEOUT}`, namespaced
  `attributes`, `events[]`, `writer`.
- **Trace := one producer invocation.** Correlation propagates via
  `HARNESS_TRACE_ID`/`HARNESS_SPAN_ID` env — best-effort display grouping
  (`attributes.trace_source ∈ {env, self, synthesized}`); detection never keys
  on topology. `phase` spans are synthesized window markers
  (`writer: "rollup"`, `attributes.source: "session_events"`, deterministic ids)
  derived from session `phase_started`/`phase_completed` events.
- **Fail-open, Zero-Heisenbug:** `emit()` never throws, never changes exit
  codes or gate verdicts; one ≤4 KB append per span budgeted ≤50 ms p99
  (conformance-proven). A broken profiler degrades to silence.
- **Evaluator-reserved attributes** — producers SHALL NOT set `heuristic`,
  `trigger_span_id`, or `source`; detection is a new append, never an edit.
- **Honesty:** estimated values use `*_est` suffixes (e.g.
  `gen_ai.usage.input_tokens_est`); unsuffixed `gen_ai.*` means measured.
  `command_label` carries a pattern-class label, never raw command text.
- **Heuristics:** `H-BOOT`, `H-LOOP`, `H-SURGE`, `H-STALL`, `H-PHANTOM` +
  `bottleneck_score` — full rules and CLI contract (`harness-profile.mjs`) in
  the proposal §4–§5.

## Conformance exemplar (worked mock — validates against the schema)

```jsonl
{"schema_version":"1.0","trace_id":"a91f03c2d77e4b01","span_id":"f04bd812","parent_span_id":null,"kind":"turn","process_name":"agent-turn","runtime":"cli","start_time_iso":"2026-11-10T16:41:12.000Z","end_time_iso":"2026-11-10T16:52:33.540Z","duration_ms":681540,"status":"OK","attributes":{"trace_source":"self","model":"inherit","context_bytes_loaded":61840,"gen_ai.usage.input_tokens_est":15460,"gen_ai.usage.output_tokens_est":2210},"writer":"runtime-hook","events":[{"time_iso":"2026-11-10T16:41:12.000Z","name":"steering_load","attributes":{"files":7,"bytes":31400}},{"time_iso":"2026-11-10T16:52:33.540Z","name":"session_write","attributes":{"session_file":"sessions/087-fix-round-3.json"}}]}
{"schema_version":"1.0","trace_id":"a91f03c2d77e4b01","span_id":"aa17c6d0","parent_span_id":"f04bd812","kind":"test","process_name":"command-gate/test-runner","runtime":"cli","start_time_iso":"2026-11-10T16:50:01.114Z","end_time_iso":"2026-11-10T16:51:09.802Z","duration_ms":68688,"status":"ERROR","attributes":{"trace_source":"env","test_runner":"jest","command_label":"test:nx","boot_duration_ms":58120,"execution_duration_ms":10568,"passed_count":11,"failed_count":1,"test_path":"libs/books/src/lib/books.service.spec.ts","failure_signature":"test:libs/books.service.spec.ts","exit_code":1},"writer":"command-gate","events":[]}
{"schema_version":"1.0","trace_id":"b22c9f01e83a5d67","span_id":"e5c2a91f","parent_span_id":null,"kind":"phase","slice_id":"book-crud-api","phase":"implementation","process_name":"asdd-implementation","runtime":"cli","start_time_iso":"2026-11-10T15:32:04.101Z","end_time_iso":"2026-11-10T17:30:41.902Z","duration_ms":7117801,"status":"OK","attributes":{"trace_source":"synthesized","source":"session_events","feature_id":"TASK-003"},"writer":"rollup","events":[]}
{"schema_version":"1.0","trace_id":"c70aa19b4fe22d09","span_id":"d3e07b41","parent_span_id":null,"kind":"sensor","slice_id":"book-crud-api","phase":"implementation","process_name":"heuristic-evaluator","runtime":"cli","start_time_iso":"2026-11-10T16:51:10.010Z","end_time_iso":"2026-11-10T16:51:10.118Z","duration_ms":108,"status":"OK","attributes":{"trace_source":"self","heuristic":"H-LOOP","trigger_span_id":"aa17c6d0","failure_signature":"test:libs/books.service.spec.ts","consecutive_failures":3,"dedup_window_min":30},"writer":"heuristic-evaluator","events":[]}
```

Readout: a `turn` invocation trace containing its gate-emitted `test` child
(env-inherited); a synthesized `phase` window marker on its own deterministic
trace; an `H-LOOP` detection span (self trace) pointing back at the third
failure via `trigger_span_id` — flag ≠ firing; append-only (detection never
annotates the trigger).
