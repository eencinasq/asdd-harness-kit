# telemetry-contract — Spec (lite)

## Intent

Land Phase 1 of the converged profiling proposal
`@asdd/proposals/harness.profiling/v2` (`v2.review.md` verdict CONVERGED):
the ratified span schema + one-pager at `.harness/state/telemetry/` — a
documentation/contract landing with **zero** script, installer, config, or
gitignore edits. Instrumentation, emitters, rollup, CLI, validator, and all
git/publish wiring are Phase-2 under guardrails `AR-1…AR-10`.

## Scope / file map

- `.harness/state/telemetry/telemetry.schema.json` — new; §2.2 schema verbatim
- `.harness/state/telemetry/README.md` — new; contract one-pager + conformance
  exemplar (the §2.3 4-line mock)

## Explicitly out of scope (Phase-2 guardrails)

`telemetry-lib.mjs`, `harness-profile.mjs`, `validators/telemetry.mjs`, span
emitters in `command-gate`/`verify-on-stop`/`sync-state`/`_runtime-template.md`,
`install-into.sh`/`generate-versions.mjs`/`package.json`/`project.json`
registration, `.gitignore`/`files[]` negations, stream rotation, checkpoint
emission — all `AR-1…AR-10`. No `spans.jsonl`/`slices/` data is created (nothing
exists to emit yet; no `.gitignore` entry needed until emitters land).

## Verification

- JSON parse of the landed schema
- Programmatic validation of the README's embedded 4-line exemplar against the
  landed schema: required keys, enums, id patterns, `additionalProperties:false`
  top level, ≤4 KB lines, evaluator-reserved-attribute discipline
- Trace-model consistency: env-child parenting, synthesized `phase` own-trace,
  detection self-trace
