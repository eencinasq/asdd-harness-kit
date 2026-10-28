# Capability: Agent guidance matches harness behavior

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (cooldown)
- Scope ID: — kit-hygiene
- Scope class: must_have

## Problem Statement
A coding agent in an installed project follows steering and agent prompts that describe mechanisms the harness removed (slice locks, `.harness/progress/` records, hand-edited `PROGRESS.md` rows, `dependency-graph.json`), statuses it cannot record (`PARKED`, `ABANDONED`), cutoffs that no gate defines, and a command gate whose name (`jev-command-gate.mjs`) claims a dependency it does not have. Nothing in the test suite catches this, so the guidance drifts further with each release and the always-loaded part keeps growing.

## Business Context
The kit's value is that agents follow a governed process. Guidance that contradicts the scripts makes agents do useless work or stall, and wastes context on every session. The maintainer now develops the kit with the kit, so the same drift also slows the kit's own slices.

## Actors
- Coding agent (installed project): reads `AGENTS.md`, always-loaded steering, and its agent prompt each session.
- Kit maintainer: runs `npm test` before a release.
- Adopting engineer: upgrades the kit in a project whose hook configs already exist.

## Domain Entities Involved
- Guidance document: `AGENTS.md`, a steering file, or an agent prompt shipped to a project. **New term — not yet in `domain-model.md`.**
- Gate rule: a `QG-*` acceptance criterion in `quality-gates.md`. **New term.**
- Slice: unit of work with a derived status. **New term** (the kit's domain model is an empty stub).
- Session: append-only event file that derives slice state. **New term.**
- Command gate: the pre-shell hook script and its verdicts. **New term.**
- Hook config: a runtime file that names the hook scripts (`.cursor/hooks.json`, `.claude/settings.json`). **New term.**
- Installed project: a repository the installer wrote into. **New term.**

All terms are flagged for the Domain phase, which seeds the kit's own domain model (and must keep it out of projects, MH-06).

## Current implementation audit

| Area | State | Evidence |
|---|---|---|
| Lock protocol | **conflicting** | `session-loop.md` says the v2 lock protocol is removed; `asdd-implementation-agent.md` still says the coordinator "holds the slice lock"; `validators/locks.mjs` is a no-op not wired in `check-invariants.mjs`; the installer still seeds `.harness/state/locks/README.md` and `paths.locks` |
| Progress records | **conflicting** | `sync-state.mjs` header: "no PROGRESS.md, no progress/<id>.md"; `asdd-implementation-agent.md` and `asdd-lite-agent.md` tell agents to update `.harness/progress/<slice>.md` and the `PROGRESS.md` row; `init-slice.mjs` appends a row "v2 compat"; `controls.md` session close claims the row matches the manifest, but no check exists |
| PARKED / ABANDONED | **missing** | `manifest.md` rule 7 and `AGENTS.md` INIT rely on them; `deriveStatus` in `sync-state.mjs` only yields `in_progress` or `DONE` |
| Knowledge agent artifacts | **conflicting** | Modes reference `dependency-graph.json`, `spike-results/`, heartbeats; nothing produces them; `docs/knowledge-base/README.md` lists `spikes/` and `slices/` |
| Agent cutoffs | **conflicting** | 8 agent prompts hold numeric cutoffs not in `quality-gates.md` (refactor 0.75/0.90, validation ≥0.95 shortcut and 0.95 dynamic target, design/implementation "raise target to 0.90", task-planning 0.85/0.70 restated, discovery/spec −0.10/−0.05, QA 100% restated and "catch 90%") |
| Command gate name | **implemented, misnamed** | `.harness/scripts/jev-command-gate.mjs` never calls Jev; referenced by hooks, installer, MCP `jev-gate-server.mjs`, CI, docs |
| Always-loaded budget | **missing** | 7 `inclusion: always` steering files + `AGENTS.md` = 36,627 bytes today; no test |
| Domain model shipping | **conflicting with MH-06** | `install_docs_root` copies `docs/architecture/domain-model.md` into projects (`create`) |
| Verification | **unknown → defined** | No existing test covers any of the above; each REQ gets one |

## Functional Scope (Behaviors)
1. Shipped guidance names only mechanisms the scripts implement (MH-01).
2. A session can park, abandon, and resume a slice; the generated manifest and registry show it (MH-02).
3. `PROGRESS.md` has one owner: `sync-state.mjs` regenerates it from the registry (MH-01 rabbit hole).
4. Agent prompts cite `QG-*` rules instead of numbers (MH-03).
5. The command gate runs as `command-gate.mjs`; the old path stays as a shim with identical verdicts (MH-04).
6. `npm test` fails when always-loaded steering exceeds the recorded budget (MH-05).
7. Projects receive the domain-model stub, not the kit's model (MH-06).
8. Sensors in `npm test` keep 1, 4, and 7 from regressing.

## Out of Scope
- The confidence-score gate model in `quality-gates.md` (no-go).
- Moving Jev out of the core (`jev-module` slice).
- Scoring rubrics inside skills.

## Non-Functional Requirements
### Performance
The new tests add less than 5 seconds to `npm test` on the maintainer's machine.
### Security
No change to the command gate's allow/deny patterns; the shim must not weaken a deny.

## Success Metrics
- 0 stale-reference, agent-cutoff, or budget failures in `npm test` at release.
- Always-loaded steering ≤ the recorded budget (target: below 36,627 bytes).

## Assumptions
- ASSUMPTION — CONFIRMED BY REQUEST: one intent covers items 2–5 of the review; they share one outcome (guidance matches enforced behavior). Scope fidelity concern recorded below.
- ASSUMPTION: `PROGRESS.md` stays (seeded in every project, read by humans) but becomes generated. Deleting it would break adopters' habits for no gain.
- ASSUMPTION: the budget is total bytes of `inclusion: always` steering plus `AGENTS.md`, set at today's size so it can only shrink or hold.

## Open Questions
- none blocking

## Anti-pattern detection (`anti-pattern-detection` skill)

| # | Pattern | Result |
|---|---|---|
| 1 | Solution masquerading as requirement | MEDIUM-risk, accepted: file names (`command-gate.mjs`, `PROGRESS.md`) are the observable contract here, not an implementation choice |
| 2 | Missing acceptance criteria | pass — MH-01…06 are EARS-style |
| 3 | Vague actors | pass |
| 4 | Undefined subjective terms | pass — budget and timing are numeric |
| 5 | Missing trigger | pass |
| 6 | Non-testable outcome | pass — each behavior maps to a test |
| 7 | Mega-capability | pass — 8 behaviors, 7 entities (at the limit) |
| 8 | Passive voice | pass |

Anti-pattern score: 8/8 = 1.00 (pattern 1 recorded as an accepted note, not a violation).

## Confidence Score
0.88 — uncertainty factors: (1) one intent holds six must-haves that touch different files; (2) the kit's domain model is empty, so every entity is new; (3) the budget value is a judgment call.
