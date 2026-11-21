# telemetry-phase2 — Design (lite)

## Components

- `cli/src/harness/telemetry-lib.mjs` — `emit`, `mintSpan` (id minting + env
  inheritance), `validateSpan` (light structural check mirroring the schema),
  `readTail` (bounded), `synthesizePhaseSpans` (content-hash ids, dedupe),
  `evaluateHeuristics` (producer-only input, evidence-field keys, 30-min dedup,
  returns detection-span objects), `measureCommand`, `writeTelemetrySignal`
  (`telemetry:<H-*>` namespaced `writeSensorSignal`-shaped record).
- `cli/src/harness/emit-span.mjs` — `asdd span`: span JSON on stdin → validate
  → emit; the agent dispatch seam (turn/subagent spans).
- `cli/src/harness/validators/telemetry.mjs` — 12th validator; warn-only;
  schema parse + bounded-tail line validation + rollup shape.
- `cli/src/harness/profile.mjs` — `asdd profile`: rollup → evaluator →
  detection spans + signals → `profiling.json` → report; exit 0/3/2.
- Instrumentation edits (minimal, fail-open): `command-gate.mjs`,
  `verify-on-stop.mjs`, `check-invariants.mjs`, `sync-state.mjs`.
- Registry/config: `commands.harness.{profile,span}`; `project.schema.json`
  + `project.json` `commands.profile`/`capabilities.telemetry`;
  `_runtime-template.md` one rule line; `lifecycle.sh` smoke row.

## Domain terms

`span`, `detection span`, `phase marker` (synthesized), `trace_source`,
`failure_signature`, `bottleneck_score` — all defined in the ratified
contract; no new terms.

## Key decisions

- Gate spans measure the gate-seam invocation (the only duration a pre-exec
  hook can honestly claim); boot/exec split comes from `measureCommand`
  contexts. Deny verdicts emit `status:"ERROR"` + `failure_signature`.
- Evaluator runs inside `asdd profile` (the only Phase-2 host the contract
  names); detection appends are spans, never edits (append-only).
- `--check` on the `harness-profile` generator stays `null` — `regen.mjs`
  excludes it by design (`EXCLUDE`).
