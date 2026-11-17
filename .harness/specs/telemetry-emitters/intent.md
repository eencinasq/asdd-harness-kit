# Intent: telemetry-emitters

## Source

- **Pitch ID:** ad-hoc (P5 roadmap — `docs/ASDD-ROADMAP.md`, gap G15)
- **Scope ID:** none — one slice; Phase 2 of `telemetry-contract`
- **Betting state:** n/a (Tech Lead request 2026-11-16: measurement foundation before evals, cost, and UI)

## Problem

The span contract (`.harness/state/telemetry/telemetry.schema.json`) exists, but nothing emits spans. The kit cannot
tell which steering files and skills an agent actually loaded, how long gates take, or where sessions stall — so
"installed vs. actually used" (the activation gap Tessl sells against) is invisible, and later slices
(`cost-metrics`, `ui-insights`) have no data.

## Desired Outcome

Fail-open span emission beside the gate paths, plus activation spans for steering/skill loads, a bounded-tail rollup,
and a read-only `asdd profile` report — landed atomically with installer/publish registration, under guardrails
`AR-1…AR-10` of `docs/knowledge-base/profiling-proposals/v2.md`.

## Must-have outcomes

- MH-01 `telemetry-lib.emit()` — one ≤4 KB `O_APPEND` write, never throws, never changes a gate verdict (AR-1 p99 ≤50 ms).
- MH-02 Emitters in `command-gate`, `verify-on-stop`, `sync-state`, and the runtime template (turn/subagent), in AR-2 wave order.
- MH-03 Activation spans: which `.harness/steering/` files and `.agents/skills/` bodies were loaded per session/phase.
- MH-04 `validators/telemetry.mjs` inside `asdd check`; `asdd profile [--slice|--bottlenecks|--json]` read-only.
- MH-05 One atomic registration (AR-5): installer copy rows, version stamps, `files[]` surgical negations, gitignore.

## No-gos

Network I/O; raw command text in spans (labels only); session-event forging (DOM-003); trace topology as detection
key (AR-10); any UI (that is `ui-insights`).

## Mapped files

Design narrows this list; nothing outside it changes.

- New: `cli/src/harness/telemetry-lib.mjs`, `cli/src/harness/harness-profile.mjs`, `cli/src/harness/validators/telemetry.mjs` (each with its `*.test.mjs`)
- Emitters: `cli/src/harness/command-gate.mjs`, `cli/src/harness/verify-on-stop.mjs`, `cli/src/harness/sync-state.mjs`, `cli/src/harness/check-invariants.mjs` (validator wiring), `cli/agents/_runtime-template.md` (source; `.agents/agents/_runtime-template.md` is its `asdd kit self` copy)
- Registration (AR-5, one atomic landing): `cli/src/harness/commands.mjs`, `cli/src/install/**`, `cli/src/kit/versions.mjs`, `cli/versions.json`, `package.json` (`files[]` negations, `test` script), `.gitignore`, `.harness/state/telemetry/**`
- Docs: `README.md` (command row)
- Widened 2026-11-16 by PO decision (discovery Q-1/Q-5/Q-6):
  - Load hooks (`asdd observe`, a hook-only, fail-open command):
    - `.claude/settings.json`
    - `.cursor/hooks.json`
    - `cli/runtimes/**` hook wiring, including `cli/runtimes/cursor/hooks.json`
    - installer runtime wiring under `cli/src/install/**` (already mapped)
    - `cli/src/harness/telemetry-observe.mjs` (with its `*.test.mjs`; Design may fold it into `telemetry-lib.mjs`)
  - Generated copies `tools/*/src/harness/telemetry-lib.mjs`: written only by `asdd kit vendor`, never hand-edited.
  - Shipped contract source: `cli/scaffold/state/telemetry/**`.
- Widened 2026-11-16 by PO decision (validation TRC-003):
  - Tests: `cli/src/harness/command-gate.test.mjs`, `cli/src/harness/sync-state.test.mjs`, `cli/src/harness/verify-on-stop.test.mjs` (new), `cli/test/install.sh`
  - Hook payload fixtures: `cli/test/fixtures/telemetry/**`
- Widened 2026-11-16 by PO decision (learning patterns LP-2a52ea2c, LP-7f51c52f opened by this slice's Stop-hook runs):
  - Steering proposals: `docs/knowledge-base/steering-proposals/SP-007.md`, `docs/knowledge-base/steering-proposals/SP-008.md`
- Widened 2026-11-17 by TL decision (checkpoint c, LP-e9c4ddb0): `docs/knowledge-base/steering-proposals/SP-009.md`

## Depends on

`telemetry-contract` (DONE). Unblocks: `cost-metrics`, `ui-insights`.
