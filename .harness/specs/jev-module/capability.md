# Capability: Jev as an optional module

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (cooldown)
- Scope ID: — jev-module
- Scope class: must_have

## Problem Statement
Every installed project carries Jev (an external scoring service) as core harness, although only two skills use it and only with an API key. Teams without Jev pay for it in always-loaded context (`jev.md`), required configuration (`capabilities.jev`), installed scripts, and an MCP server. The core invariants even import Jev code for a check that always returns "skipped".

## Business Context
The kit sells portability. An external, keyed dependency in the core undercuts that, and the kit review (2026-10-28) named it as the first thing to make optional. The Tech Lead decided that `shape-up` and `product-delivery` stay in the core and become usable without Jev.

## Actors
- Adopting engineer: installs or upgrades the kit, with or without `--modules=jev`.
- Shaper / product lead: runs `shape-up` (betting) and `product-delivery` (EARS freeze, scope choice).
- Coding agent: reads skills and steering; runs the harness.

## Domain Entities Involved
- Module: an opt-in set of files the installer copies only when enabled and records in `project.json` → `modules`. **New term** for `domain-model.md` (the model lists Installer and Installed project).
- Installer, Installed project, Guidance document, Binding: as defined in `domain-model.md`.
- Gate decision: the outcome of a betting or EARS gate, decided by Jev (module) or by a human (no module). **New term.**

## Current implementation audit

| Area | State | Evidence |
|---|---|---|
| Jev scripts in projects | **implemented, always** | `install-into.sh` copies `jev-client.mjs`, `jev-gates.mjs` (scaffold), `jev-gate-server.mjs` (MCP) unconditionally |
| `jev.md` | **always loaded** | `inclusion: always`, 2,475 bytes, in `install_portable_steering` |
| MCP entry | **always** | kit baseline `.agents/mcp/mcp.json` lists `jev-gate` |
| `capabilities.jev` | **required** | project.json template and upgrade patcher seed it; `check-project-config.mjs` fails without it |
| Core invariants | **dead dependency** | `check-invariants.mjs` imports `assertJevConfigured` and calls it without `skillRequired`, so it always returns `ok/skipped` |
| `validators/jev-gold-plating.mjs` | **dead** | no-op export, not wired in `check-invariants.mjs`, still installed via the validators tree |
| `check_command_safety` MCP tool | **misplaced** | pattern-only tool (no Jev) served by `jev-gate-server.mjs`; hooks and the README use the `command-gate.mjs` CLI |
| Skills | **Jev-required** | `shape-up/SKILL.md` and `product-delivery/SKILL.md` stop when Jev is `unavailable`; no path without Jev |
| Modules mechanism | **implemented** | `enable_one_module` / `enable_modules` in the installer, `modules` in `project.json`, `--modules=all` |
| Tests | **assume core Jev** | `test-install-into.sh` asserts Jev files and `capabilities.jev` on every install; `test-full-flow.sh` uses Jev when `JEV_API_KEY` is set |
| Verification | **defined** | each MH gets a test in `test-install-into.sh` or a unit test |

## Functional Scope (Behaviors)
1. A default install has no Jev files, MCP entry, steering, or config, and its config and invariant checks pass (MH-01).
2. `--modules=jev` (and `--modules=all`) installs today's Jev surface and records `modules.jev: true` (MH-02).
3. The two skills branch on `modules.jev`: Jev gates required with the module; the same criteria as a human-decided checklist without it (MH-03).
4. An upgrade of a project that already has Jev enables the module automatically (MH-04).
5. Core scripts import no Jev code; the dead validator is removed (MH-05).
6. This slice's artifacts stay kit-only (MH-06; covered by the existing leak test plus an explicit check).

## Out of Scope
- Jev thresholds and client behavior (no-go).
- Removing the `jev-command-gate.mjs` shim (no-go).
- A new MCP server for `check_command_safety`.

## Non-Functional Requirements
### Performance
No new runtime cost; the always-loaded steering of a default install shrinks by about 2.5 KB.
### Security
`JEV_API_KEY` stays env-only; `apiKey` in config must stay empty when the module is enabled.

## Success Metrics
- A default install contains zero files whose name or content requires Jev, outside the two skills' optional branch and the command-gate shim.
- `npm test` covers default, `--modules=jev`, and upgrade installs.

## Assumptions
- ASSUMPTION — CONFIRMED (Tech Lead): skills stay in the core with a human-decided path.
- ASSUMPTION: Jev source files stay at their current paths (`.harness/scripts/`, `.agents/mcp/`) and the installer gates their copy, instead of moving them under `.agents/modules/jev/`. Moving them would break their relative imports in projects (the modules README already forbids relative imports in module adapters).
- ASSUMPTION: `--modules=all` includes `jev` (all means all).

## Open Questions
- none blocking

## Anti-pattern detection (`anti-pattern-detection` skill)

| # | Pattern | Result |
|---|---|---|
| 1 | Solution masquerading as requirement | accepted note: `--modules=jev` and file names are the observable install contract |
| 2 | Missing acceptance criteria | pass |
| 3 | Vague actors | pass |
| 4 | Undefined subjective terms | pass |
| 5 | Missing trigger | pass |
| 6 | Non-testable outcome | pass |
| 7 | Mega-capability | pass — 6 behaviors, 6 entities |
| 8 | Passive voice | pass |

Anti-pattern score: 8/8 = 1.00.

## Confidence Score
0.87 — uncertainty factors: (1) upgrade detection must not enable Jev for a project that never had it; (2) skills text must keep one set of criteria for both branches; (3) `--modules=all` now needs a key to be useful.
