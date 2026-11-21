# telemetry-phase2 — Spec (lite)

## Intent

Land Wave 3 of the microkernel work plan: the Phase-2 instrumentation of the
ratified `harness.profiling/v2` contract — `telemetry-lib.mjs`, the WARN-only
`validators/telemetry.mjs`, and `asdd profile` (rollup + heuristics + report),
plus proposal convergence in the vault. Guardrails `AR-1…AR-10` apply verbatim.

## Requirements

- **REQ-001.** `emit(span)` SHALL do at most one ≤4,096-byte `O_APPEND` write to
  `.harness/state/telemetry/spans.jsonl`, SHALL NOT throw/reject/alter exit
  codes or gate verdicts, and SHALL return `false` silently on missing dir,
  read-only FS, or oversize/malformed span (AR-1, D-3).
- **REQ-002.** Spans SHALL conform to `telemetry.schema.json`: env ids from
  `HARNESS_TRACE_ID`/`HARNESS_SPAN_ID` (`trace_source:"env"`), else self-minted
  (`"self"`); producers never set `heuristic`/`trigger_span_id`/`source`;
  `command_label` is a pattern label, never raw text.
- **REQ-003.** Instrumentation per AR-2 order: `command-gate` (one
  `command`/`test` span per gate invocation — gate-side duration, `ERROR` +
  `failure_signature` on deny), `verify-on-stop` (`hook` span: duration,
  `violations_count`, `exit_code`), `check-invariants` (`sensor` span), and
  `sync-state` (`sync` span + child `command` spans). An `asdd span` CLI seam +
  one `_runtime-template.md` rule line SHALL cover agent `turn`/`subagent`
  emission; `measureCommand` SHALL cover non-gate test contexts.
- **REQ-004.** `validators/telemetry.mjs` SHALL warn — never fail — on schema
  violations, reading only a bounded tail (~500 lines/256 KB); absent telemetry
  state is legal (D-6).
- **REQ-005.** `asdd profile --slice|--bottlenecks|--json` SHALL produce §5
  outputs: phase table from synthesized `phase` markers (deterministic ids,
  dedupe by `span_id`), `H-BOOT/H-LOOP/H-SURGE/H-STALL/H-PHANTOM` findings as
  append-only detection spans + `telemetry:<H-*>` learning signals,
  `bottleneck_score` per §4, exit `0`/`3`/`2`; it SHALL write
  `slices/<id>/profiling.json` and SHALL NOT touch sessions/manifest/registry.
- **REQ-006.** Registration atomicity (AR-5): `commands.harness.profile` +
  `commands.harness.span` in `contribution-points.json`; `commands.profile` +
  `capabilities.telemetry` in `project.json` + schema; `cli/test/lifecycle.sh`
  smoke row; `npm test` list updated. Vault `harness.profiling/v2.md` synced
  with the DOM-11-pinned repo copy and marked `status: converged`.
