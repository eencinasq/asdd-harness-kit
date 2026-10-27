---
inclusion: auto
tags:
  - lite
---

# ASDD-Lite — Default Path (Lite-First)

Lite is the **default entry mode for every slice**. The full 9-phase pipeline is
opt-in (`init-slice.mjs --full`) for work known upfront to be cross-cutting or
architectural. Growth in a lite slice is not a judgment call: the harness
detects escalation evidence from sessions and blocks the slice from completing
until it is acknowledged.

## When to use

Lite is the default. Choose **full only upfront** when the work is provably a
new user-facing capability spanning modules, cross-cutting, or architectural.
Rule of thumb for what keeps a slice lite: single module scope, ≤1 new domain
concept, serial work (one `in_progress` feature).

## Escalation triggers (machine-enforced)

| # | Evidence | Source | Effect |
|---|----------|--------|--------|
| E1 | Scope spans ≥2 top-level modules | `scope_paths` on `feature_started` sessions | signal → blocks DONE |
| E2 | >1 `in_progress` feature | `.features.json` + lite mode | **FAIL invariants** (lite is serial) |
| E3 | >1 new domain term declared | `new_domain_terms` on `checkpoint` sessions | signal → blocks DONE |
| E4 | Architectural contention | any `dissent` session | signal → blocks DONE |
| E5 | Implementation blockage | `phase_blocked` in `implementation` | signal → blocks DONE |

Open signals are WARN during work (`harness-status.mjs` lists them). A
`phase_completed` for `qa`/`knowledge` while signals are open is a FAIL:
`sync-state` also refuses to derive `DONE` for such a slice.

## How to escalate

```bash
node .harness/scripts/escalate-slice.mjs <slice-id> --reasons "E1-scope-spread,E4-dissent" [--by <owner>]
```

This appends a `checkpoint` session with `mode: "escalated"`. Then:

1. Backfill `.harness/specs/<slice>/capability.md` and `requirements.md` from `spec.md`.
2. Continue from the appropriate full-ASDD phase (Validation → Domain → Design → …).

The slice's `spec.md`, `design.md`, `tasks.md` remain — full artifacts are additive.

## Phase mapping

| Full ASDD (9 phases) | ASDD-Lite (4 phases) | What changes |
|----------------------|----------------------|--------------|
| Discovery + Spec | **Spec** | One `spec.md` — 1-paragraph intent + 3-5 EARS MUST requirements. No capability decomposition, no prioritization matrix. |
| Validation + Domain + Design | **Design** | One `design.md` — what changes (files/modules), new domain terms (or "none"), 1-2 ADRs *only if* architectural decision needed. No confidence scores. |
| Task Planning | **Tasks** | Simple `tasks.md` — 1-5 tasks, single wave, direct mapping to `features.json`. No dependency graph. |
| Implementation | **Implementation** | Same TDD red-green-refactor. One feature at a time. |
| QA | **QA-Light** | Run existing + new tests, verify coverage. No formal spec-coverage-report unless >10% uncovered. |
| Knowledge | **Skip** (or 1-paragraph note) | Only if a reusable pattern emerged. |

## Artifacts

| Full ASDD | ASDD-Lite |
|-----------|-----------|
| intent.md, capability.md, requirements.md, spec-validation-report.md, domain-model updates, design.md, tasks.md, features.json, spec-coverage-report.md, completion notes | `spec.md`, `design.md`, `tasks.md`, `features.json` |

## Non-negotiables (unchanged from full ASDD)

1. **TDD** — every behavioral task is RED-first.
2. **Verification** — no `passing` without evidence.
3. **Traceability** — requirements → tasks → features.
4. **Codegraph first** — before edits in unfamiliar modules.
5. **Serial execution** — ASDD-Lite allows at most one `in_progress` feature in `.features.json`; the parallel task contract is for fully planned slices only.
6. **No gold-plating** — modify only files mapped to `.harness/specs/<slice>/spec.md`, as in [session-loop.md](./session-loop.md). Do not perform unrequested refactors.
7. **Jev** — not used in ASDD-Lite. Jev is required only inside `shape-up` and `product-delivery` ([jev.md](./jev.md)).

## Dropped from full ASDD

- Per-phase confidence scoring (`QG-DIS`, `QG-SPC`, `QG-VAL`, `QG-DMN`, `QG-DES`, `QG-TPL`)
- Formal quality gates (BLOCK/WARN thresholds)
- Multi-agent orchestration (one agent owns the whole slice)
- Scope mapping (done upstream by `product-delivery`; one intent = one slice)
- Domain model updates (unless new terms introduced)
- Parallel wave execution
- Spec validation report (self-review instead)

## Gate policy

ASDD-Lite slices do **not** populate `gates` in the per-slice manifest. Use session `checkpoint` events for informal notes. The slice still follows `schema_version: "3.0"` and the standard `status` machine (`in_progress` → `DONE` / `PARKED` / `ABANDONED`).

## Per-slice manifest shape (generated)

```json
{
  "schema_version": "3.0",
  "slice_id": "<slice-id>",
  "phase": "implementation",
  "status": "in_progress",
  "mode": "lite",
  "escalation_signals": [],
  "escalation_required": false,
  "gates": {},
  "active_features": [],
  "session_log": [],
  "contributors": [],
  "paths": {
    "spec_dir": ".harness/specs/<slice-id>",
    "domain_model": "docs/architecture/domain-model.md",
    "knowledge_base": "docs/knowledge-base/",
    "features": ".harness/features/<slice-id>.features.json"
  }
}
```

## Escalation

See [Escalation triggers](#escalation-triggers-machine-enforced) and
[How to escalate](#how-to-escalate) above — the transition is triggered by
session evidence and performed with `escalate-slice.mjs`, not by hand-editing
sessions or manifests.

## Agent

The lightweight agent definition is at `.agents/agents/asdd-lite-agent.md`. One agent owns all four phases sequentially; no sub-agent orchestration needed.
