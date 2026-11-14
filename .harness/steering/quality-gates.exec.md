---
inclusion: auto
tags:
  - task_planning
  - implementation
  - qa
  - refactor
classification: portable
---

# Quality Gates — execution gates

Gates applied during implementation, QA, refactor, and the task-planning boundary. Shared machinery lives in [quality-gates.md](quality-gates.md); the binding lives in [quality-gates.project.md](quality-gates.project.md).

**Actor:** the agent applying the gate. Spec Coverage is applied by the QA Agent. Domain Placement is applied by Implementation (before `passing`), QA (Mode B), and Refactor.

## Spec Coverage Gate

The QA Agent evaluates this gate against tests that verify the current spec.

**Measurements**

- **Spec-related test pass rate:** percentage of executed spec-related tests that pass. 100% means zero failing spec-related tests.
- **MUST requirement coverage:** percentage of MUST requirements that each have at least one verifying test.
- **EARS criteria coverage (MUST):** percentage of EARS acceptance criteria on MUST requirements that each have one specific test.
- **SHOULD requirement coverage:** percentage of SHOULD requirements that each have at least one verifying test.
- **Spec coverage:** percentage of requirements that each have at least one happy-path test and at least one error-path test.
- **COULD requirement coverage:** percentage of COULD requirements that each have at least one verifying test.

### Acceptance criteria

- **QG-SPEC-01.** The QA Agent shall count a requirement or EARS criterion as covered only when a specific test asserts it.
- **QG-SPEC-02.** If the spec contains no requirements of a given priority, then the QA Agent shall treat coverage for that priority as 100%.
- **QG-SPEC-03.** If the spec lists one or more MUST requirements and no spec-related test was executed, then the QA Agent shall return BLOCK.
- **QG-SPEC-04.** When the spec-related test pass rate is below 100%, the QA Agent shall return BLOCK.
- **QG-SPEC-05.** When MUST requirement coverage is below 100%, the QA Agent shall return BLOCK.
- **QG-SPEC-06.** When EARS criteria coverage for MUST requirements is below 100%, the QA Agent shall return BLOCK.
- **QG-SPEC-07.** When SHOULD requirement coverage is below 95%, the QA Agent shall return WARN.
- **QG-SPEC-08.** When spec coverage is below 95%, the QA Agent shall return WARN.
- **QG-SPEC-09.** The QA Agent shall log COULD requirement coverage as INFO and shall not return BLOCK or WARN because that coverage is below any percentage.
- **QG-SPEC-10.** If a failure is in a test file unrelated to the current spec, then the QA Agent shall exclude that failure from this gate, shall record it as `OBS-xxx` in the spec coverage report, and shall append it to the agent failure log.

Unrelated failures excluded here remain in force for the Tech Debt Cleanup Gate.

## Domain Placement Gate

Portable rules and scope: [domain-layer.md](domain-layer.md). Findings, paths, and commands: [quality-gates.project.md](quality-gates.project.md) and [domain-layer.project.md](domain-layer.project.md).

### Acceptance criteria

- **QG-DOM-01.** The agent shall record a domain-placement finding only for a file changed by the slice diff, unless [quality-gates.project.md](quality-gates.project.md) states a wider scope for that finding.
- **QG-DOM-02.** If untouched legacy logic is documented as grandfathered, then the agent shall not record that logic as a finding.
- **QG-DOM-03.** When a changed file matches an active finding row in [quality-gates.project.md](quality-gates.project.md), the agent shall apply that row's severity and action.
- **QG-DOM-04.** If a placement violation matches no active finding row, then the agent shall apply [domain-layer.md](domain-layer.md) and shall not lower the severity.
- **QG-DOM-05.** When a HIGH finding is open, the Refactor agent shall classify it as CRITICAL or HIGH and shall correct it before marking the refactor complete.
- **QG-DOM-06.** When a HIGH finding is open, the Implementation agent shall withhold `passing` until that finding is closed.

## Spec Drift Gate

Computational sensor: `asdd drift` (also inside `asdd check`, so Verify-on-Stop and CI run it). Checks `DRIFT-01` … `DRIFT-07`: [README → spec drift and audit](https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit). Bindings (test globs, base branch): [quality-gates.project.md](quality-gates.project.md).

### Acceptance criteria

- **QG-DRIFT-01.** If a changed product file is not mapped to the active slice (`DRIFT-01`), then the agent shall not mark any feature `passing` and shall either revert the change or add the path to the spec through the owning phase.
- **QG-DRIFT-02.** When a `passing` feature's owned files change after its `evidence_hash` (`DRIFT-02`), the agent shall set the feature back to `in_progress` and shall rerun its verification.
- **QG-DRIFT-03.** While any MUST requirement has no implementing feature (`DRIFT-03`), the QA agent shall return BLOCK for the Spec Coverage Gate.
- **QG-DRIFT-04.** *(Optional, inactive.)* When the squad sets a spec compliance cutoff here, the QA agent shall return BLOCK below it. No cutoff is set; the CI workflow, the MCP server, and the dashboard shall not define one.
- **QG-DRIFT-05.** The agent shall treat inferential audit findings as advisory until the Tech Lead confirms them, and shall not use them to return BLOCK.

## Tech Debt Cleanup Gate (SP-002)

This gate is mandatory before any new spec enters Task Planning.

### Acceptance criteria

- **QG-DEB-01.** When a new spec is a candidate to enter Task Planning, the agent shall run the full-suite test command recorded in [quality-gates.project.md](quality-gates.project.md) before advancing the phase.
- **QG-DEB-02.** When that command reports one or more test failures, the agent shall return BLOCK.
- **QG-DEB-03.** When the suite contains one or more pre-existing failures in specs unrelated to the current spec, the agent shall return BLOCK.
- **QG-DEB-04.** When that command reports zero failures, the agent shall record zero failures for this gate and shall return PASS for this gate.
- **QG-DEB-05.** If the agent records a failure or an `OBS-xxx` observation, then the agent shall append it to the agent failure log path in [quality-gates.project.md](quality-gates.project.md) with a `**Signature:**` line (`<check-or-area>:<short-kebab-cause>`, reused verbatim for the same failure) so the learning loop can count it.
- **QG-DEB-06.** When the same failure reaches the occurrence threshold, the [Learning Gate](quality-gates.learn.md) applies: the agent shall record which guide or sensor in [controls.md](controls.md) must change so that failure is less likely. The agent shall not close the entry as an observation only.
- **QG-DEB-07.** The agent shall exclude an unrelated pre-existing failure from the Spec Coverage Gate and shall include that same failure in this gate.

## Negative space

- No phase-confidence gates — those live in `quality-gates.phases.md`; this file is execution-time evidence gates only.
- No check definitions beyond the tables — `DRIFT-*` mechanics stay in `asdd drift`/`drift-lib.mjs`; [spec-drift.md](./spec-drift.md) owns the author/review workflow.
- No project commands or values — `quality-gates.project.md` binding supplies them (`QG-DEC-08`).

## Enforcement

Computational: test commands, drift checks, and Semgrep run as commands whose output decides — the agent does not estimate results; `asdd check` runs the drift suite at Verify-on-Stop and in CI.

## Escalation

Gate states per the core file; a recurring failure opens a learning pattern (`QG-DEB-06` → [quality-gates.learn.md](quality-gates.learn.md)) — fix the control, not the symptom; `unavailable`/`unconfigured` verdicts are recorded states, never passes.
