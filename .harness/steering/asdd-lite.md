---
inclusion: auto
tags:
  - lite
---

# ASDD-Lite — Lightweight Path for Small Features & Bugs

A streamlined alternative to the full 9-phase ASDD pipeline for **small, well-scoped work** (bug fixes, UI tweaks, config changes, single-module features). Cuts ceremony while preserving non-negotiables: TDD, verification, traceability, and Codegraph-first exploration.

## When to use

| Signal | Path |
|--------|------|
| New user-facing capability, cross-cutting, architectural | **Full ASDD** |
| Small feature, bug fix, UI tweak, config change | **ASDD-Lite** |
| Uncertain — start Lite, escalate if scope grows | **ASDD-Lite** |

Rule of thumb: if the work touches ≤3 files and introduces ≤1 new domain concept, use Lite.

## Phase mapping

| Full ASDD (9 phases) | ASDD-Lite (4 phases) | What changes |
|----------------------|----------------------|--------------|
| Discovery + Spec | **Spec** | One `spec.md` — 1-paragraph intent + 3-5 EARS MUST requirements. No capability decomposition, no prioritization matrix. |
| Validation + Domain + Design | **Design** | One `design.md` — what changes (files/modules), new domain terms (or "none"), 1-2 ADRs *only if* architectural decision needed. No confidence chain, no CCS. |
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
5. **Lock protocol** — one writer per slice (`.harness/state/locks/<slice-id>.lock`).
6. **Serial execution** — ASDD-Lite allows at most one `in_progress` feature in `.features.json`; the parallel task contract is for fully planned slices only.
7. **No gold-plating** — modify only files mapped to `.harness/specs/<slice>/spec.md`, as in [session-loop.md](./session-loop.md). Do not perform unrequested refactors.

## Dropped from full ASDD

- Confidence Chain (CCS) scoring
- Formal quality gates (BLOCK/WARN thresholds)
- Multi-agent orchestration (one agent owns the whole slice)
- Behavioral Slicing / capability prioritization
- Domain model updates (unless new terms introduced)
- Parallel wave execution
- Spec validation report (self-review instead)

## Gate policy

ASDD-Lite slices do **not** populate `gates` or `confidence_chain` in the per-slice manifest. Use `phase_data` for informal notes. The slice still follows `schema_version: "2.0"` and the standard `status` machine (`in_progress` → `DONE` / `PARKED` / `ABANDONED`).

## Per-slice manifest shape

```json
{
  "schema_version": "2.0",
  "slice_id": "<slice-id>",
  "phase": "implementation",
  "status": "in_progress",
  "mode": "lite",
  "ccs": null,
  "confidence_chain": [],
  "phase_data": {
    "lite_rationale": "bug fix — ≤3 files, no new domain concepts"
  },
  "paths": {
    "spec_dir": ".harness/specs/<slice-id>",
    "domain_model": "docs/architecture/domain-model.md",
    "knowledge_base": "docs/knowledge-base/",
    "features": ".harness/features/<slice-id>.features.json",
    "progress": ".harness/progress/<slice-id>.md"
  },
  "agent_heartbeats": {}
}
```

## Escalation

If during implementation the scope grows (new modules, multiple user surfaces, architectural decisions), escalate to full ASDD:

1. Set `mode: "escalated"` in the per-slice manifest.
2. Backfill `capability.md` and `requirements.md` from `spec.md`.
3. Continue from the appropriate full-ASDD phase (Validation → Domain → Design → …).

## Agent

The lightweight agent definition is at `.agents/agents/asdd-lite-agent.md`. One agent owns all four phases sequentially; no sub-agent orchestration needed.
