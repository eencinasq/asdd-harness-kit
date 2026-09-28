---
inclusion: always
---

# Quality Gates

Portable thresholds that govern gate decisions across spec coverage, design readiness, task planning, and tech debt. Apply these rules when evaluating whether work can proceed to the next pipeline phase.

**Project binding (mandatory):** concrete test commands, domain-placement findings, and stack paths live in [quality-gates.project.md](quality-gates.project.md). Agents must apply both this contract and that binding.

## Gate Actions

- **BLOCK**: Hard stop. The phase cannot proceed until the metric is satisfied.
- **WARN**: Proceed with caution. Flag the issue but do not block.
- **INFO**: Log for visibility only. No action required.

## Spec Coverage Gate

Evaluated by the QA Agent against spec-related tests.

| Metric | Threshold | Action |
|---|---|---|
| Spec-related test pass rate | 100% (0 failures) | BLOCK |
| MUST requirement coverage | 100% | BLOCK |
| EARS criteria coverage (MUST) | 100% | BLOCK |
| SHOULD requirement coverage | ≥ 95% | WARN |
| Spec coverage (happy + error paths) | ≥ 95% | WARN |
| COULD requirement coverage | — | INFO |

## Cumulative Confidence Score (CCS)

| Score | Action |
|---|---|
| < 0.50 | BLOCK — spec requires rework |
| 0.50–0.65 | WARN — proceed with caution, flag uncertainty factors |
| > 0.65 | PASS |

## Design Readiness Gate

All conditions must pass before entering task planning.

| Metric | Threshold | Action |
|---|---|---|
| Design confidence score | ≥ 0.85 | BLOCK |
| Requirements status | READY | BLOCK |
| Validation gate decision | PASSED or PASSED_WITH_WARNINGS | BLOCK |

## Task Planning Readiness Gate

| Metric | Threshold | Action |
|---|---|---|
| Task planning confidence score | ≥ 0.85 | BLOCK — revise task plan |
| Task planning confidence score | < 0.70 | BLOCK — return to design phase |
| Design status | READY | BLOCK |

## Domain Placement Gate

Evaluated by Implementation (before `passing`), QA (Mode B), and Refactor. Portable rules and scope: [domain-layer.md](domain-layer.md). Concrete findings, paths, and enforcement commands: [quality-gates.project.md](quality-gates.project.md) + [domain-layer.project.md](domain-layer.project.md).

Findings apply **only to files changed by the slice diff** unless the project binding says otherwise; untouched legacy logic documented as grandfathered is not a finding.

HIGH findings count as CRITICAL/HIGH for Refactor ("correct immediately") and for Harness: a feature is not `passing` while one is open.

## Tech Debt Cleanup Gate (SP-002)

Mandatory before any new spec enters the Task Planning phase.

| Metric | Threshold | Action |
|---|---|---|
| Global repository test failures | 0 | BLOCK |
| Pre-existing test failures across unrelated specs | 0 | BLOCK |

Enforcement: run the **full-suite test command** from [quality-gates.project.md](quality-gates.project.md), fix pre-existing failures, record 0 failures for the gate, and track failures in the project's agent failure log (see `structure.md` for path).

## Pre-Existing Test Failures

Failures in test files unrelated to the current spec are handled separately:
- Do not count against the spec coverage gate.
- Document as observations (OBS-xxx) in the spec coverage report.
- Track in the project agent failure log (3-occurrence rule triggers investigation).

The Tech Debt Cleanup Gate (SP-002) ensures these are resolved before new specs enter implementation, preventing compounding debt.
