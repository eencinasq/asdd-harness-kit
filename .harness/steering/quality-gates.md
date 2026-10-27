---
inclusion: auto
tags:
  - validation
  - qa
  - implementation
  - task_planning
---

# Quality Gates

Portable acceptance criteria for the phase chain, discovery, spec, validation, domain, spec coverage, design readiness, task planning readiness, domain placement, spec drift, and tech debt. These criteria are normative. The agent applying a gate shall apply them as written.

**Project binding (mandatory):** test commands, domain-placement findings, and stack paths live in [quality-gates.project.md](quality-gates.project.md). The agent shall apply this contract and that binding together.

**Actor:** the agent applying the gate. Spec Coverage is applied by the QA Agent. Domain Placement is applied by Implementation (before `passing`), QA (Mode B), and Refactor.

## EARS patterns

| Pattern | Form |
|---|---|
| Universal | The `<actor>` shall `<response>`. |
| Event-driven | When `<trigger>`, the `<actor>` shall `<response>`. |
| Conditional | If `<condition>`, then the `<actor>` shall `<response>`. |

## Gate actions

- **BLOCK:** hard stop. The phase shall not proceed until the triggering condition is gone.
- **WARN:** the phase may proceed only with the triggering condition flagged.
- **INFO:** log the measurement. INFO does not change the gate decision.
- **PASS:** every BLOCK and WARN criterion of that gate is untriggered.

### Decision rules

- **QG-DEC-01.** The agent shall decide each gate separately.
- **QG-DEC-02.** When any criterion of a gate returns BLOCK, the agent shall return BLOCK for that gate.
- **QG-DEC-03.** If no criterion of a gate returns BLOCK and at least one returns WARN, then the agent shall return WARN for that gate.
- **QG-DEC-04.** When no BLOCK criterion and no WARN criterion of a gate is triggered, the agent shall return PASS for that gate.
- **QG-DEC-05.** The agent shall log every INFO result and shall not use an INFO result to select BLOCK, WARN, or PASS.
- **QG-DEC-06.** The agent shall compare each score to the bounds below using the recorded value, and shall not round a score across a bound.
- **QG-DEC-07.** If the slice manifest `mode` is `lite`, then the agent shall skip these gates and shall follow [asdd-lite.md](asdd-lite.md).
- **QG-DEC-08.** If a value required from [quality-gates.project.md](quality-gates.project.md) is still unfilled, then the agent shall return BLOCK for the gate that requires it and shall not invent a command, path, or finding.
- **QG-DEC-09.** Before starting a phase, the agent shall read `gates` in the generated slice manifest. When the gate of the preceding phase is missing or BLOCK, the agent shall not start. When it is WARN, the agent shall start only after a Tech Lead `override` session for that phase (`acknowledged_by` in the gate). Domain is optional: when no domain gate exists, Design follows Validation. Refactor follows QA. `check-invariants.mjs` reports violations as WARN.
- **QG-DEC-10.** Each agent shall record its phase confidence score and uncertainty factors in the session `evidence`. The agent shall log a confidence trend across phases as INFO only and shall not combine scores across phases into a gate decision.

## Discovery Gate

Applied by the Discovery Agent before it writes `phase_completed` for `discovery`. The anti-pattern score comes from the `anti-pattern-detection` skill.

### Acceptance criteria

- **QG-DIS-01.** When the discovery confidence score is less than 0.85, the agent shall return BLOCK and shall set the capability status to `DRAFT — AWAITING CLARIFICATION`.
- **QG-DIS-02.** When the anti-pattern score is less than 0.70 or a CRITICAL anti-pattern is unresolved, the agent shall return BLOCK and shall flag the capability for PO review.
- **QG-DIS-03.** When the anti-pattern score is greater than or equal to 0.70 and less than 0.85, the agent shall return WARN, shall apply the suggested fixes, and shall list the remaining findings as concerns.
- **QG-DIS-04.** When the discovery confidence score and the anti-pattern score are each greater than or equal to 0.85, the agent shall return PASS for this gate.

## Spec Gate

Applied by the Spec Agent before it writes `phase_completed` for `spec`.

### Acceptance criteria

- **QG-SPC-01.** When the spec confidence score is less than 0.85, the agent shall return BLOCK and shall set requirements status to `DRAFT` or `BLOCKED`.
- **QG-SPC-02.** When the anti-pattern score is less than 0.70 or a CRITICAL anti-pattern is unresolved, the agent shall return BLOCK and shall set requirements status to `DRAFT`.
- **QG-SPC-03.** If an acceptance criterion does not follow an EARS pattern, or a requirement names a domain entity absent from the domain model without flagging it as an uncertainty factor, then the agent shall return BLOCK.
- **QG-SPC-04.** When the spec confidence score is greater than or equal to 0.85 and no BLOCK criterion is triggered, the agent shall set requirements status to `READY` and shall return PASS for this gate.

## Validation Gate

Applied by the Validation Agent. The gate decision is the `Gate Decision` of `spec-validation-report.md`.

### Acceptance criteria

- **QG-VAL-01.** When one or more BLOCKING findings exist in MUST requirements, the agent shall decide `BLOCKED` and shall return BLOCK.
- **QG-VAL-02.** When no BLOCKING finding exists in MUST requirements but HIGH findings or failing SHOULD or COULD requirements remain, the agent shall decide `PASSED_WITH_WARNINGS`, shall return WARN, and shall list each finding as a concern.
- **QG-VAL-03.** When the validation confidence score is less than 0.75, the agent shall return WARN and shall list each uncertainty factor that produced the score.
- **QG-VAL-04.** When no BLOCKING or HIGH finding exists and the validation confidence score is greater than or equal to 0.75, the agent shall decide `PASSED` and shall return PASS for this gate.
- **QG-VAL-05.** If a prior validation report exists, then the agent shall return BLOCK while any prior BLOCKING finding remains unaddressed.

## Domain Gate

Applied by the Domain Agent when the slice runs the domain phase.

### Acceptance criteria

- **QG-DMN-01.** When the domain confidence score is less than 0.85, the agent shall return BLOCK; the Spec Agent shall not re-run and the Design Agent shall not start.
- **QG-DMN-02.** If an entity referenced in `requirements.md` is absent from the domain model, then the agent shall return BLOCK.
- **QG-DMN-03.** When the domain confidence score is greater than or equal to 0.85 and no BLOCK criterion is triggered, the agent shall return PASS for this gate.

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

## Gate States

Each phase gate resolves to one of three states. The agent reports; the Tech Lead decides.

| State | Meaning | Agent Action | TL Action |
|-------|---------|--------------|-----------|
| **PASS** | All criteria met, evidence recorded | Proceed to next phase | Review and acknowledge |
| **WARN** | Criteria met, but concerns remain | Proceed with documented concerns | Decide if concerns are acceptable |
| **BLOCK** | One or more criteria failed | Stop. Do not proceed. | Review and direct remediation |

### Acceptance criteria

- **QG-GATE-01.** An agent shall return PASS only when every criterion of the gate is satisfied and evidence is recorded.
- **QG-GATE-02.** An agent shall return WARN when every BLOCK criterion is satisfied but at least one concern remains undocumented or unresolved.
- **QG-GATE-03.** An agent shall return BLOCK when any criterion of the gate fails.
- **QG-GATE-04.** A WARN with non-empty concerns requires TL acknowledgment before the phase advances.
- **QG-GATE-05.** A BLOCK requires remediation and re-evaluation before the phase advances.

## Design Readiness Gate

The slice shall enter task planning only when this gate returns PASS.

### Acceptance criteria

- **QG-DES-01.** When the design confidence score is greater than or equal to 0.85, requirements status is `READY`, and the validation gate decision is `PASSED` or `PASSED_WITH_WARNINGS`, the agent shall return PASS for this gate.
- **QG-DES-02.** When the design confidence score is less than 0.85, the agent shall return BLOCK and shall require a design revision.
- **QG-DES-03.** If requirements status is any value other than `READY`, then the agent shall return BLOCK.
- **QG-DES-04.** If the validation gate decision is any value other than `PASSED` or `PASSED_WITH_WARNINGS`, then the agent shall return BLOCK.

## Task Planning Readiness Gate

Bounds for the task planning confidence score: below 0.70, from 0.70 inclusive to below 0.85, and greater than or equal to 0.85.

### Acceptance criteria

- **QG-TPL-01.** When the task planning confidence score is greater than or equal to 0.85 and design status is `READY`, the agent shall return PASS for this gate.
- **QG-TPL-02.** When the task planning confidence score is greater than or equal to 0.70 and less than 0.85, the agent shall return WARN and shall list each uncertainty factor that produced the score.
- **QG-TPL-03.** When the task planning confidence score is less than 0.70, the agent shall return BLOCK and shall return the slice to the design phase.
- **QG-TPL-04.** If design status is any value other than `READY`, then the agent shall return BLOCK.

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

Computational sensor: `node .harness/scripts/check-spec-drift.mjs` (also inside `check-invariants.mjs`, so Verify-on-Stop and CI run it). Checks `DRIFT-01` … `DRIFT-07`: [README → spec drift and audit](https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit). Bindings (test globs, base branch): [quality-gates.project.md](quality-gates.project.md).

### Acceptance criteria

- **QG-DRIFT-01.** If a changed product file is not mapped to the active slice (`DRIFT-01`), then the agent shall not mark any feature `passing` and shall either revert the change or add the path to the spec through the owning phase.
- **QG-DRIFT-02.** When a `passing` feature's owned files change after its `evidence_commit` (`DRIFT-02`), the agent shall set the feature back to `in_progress` and shall rerun its verification.
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
- **QG-DEB-05.** If the agent records a failure or an `OBS-xxx` observation, then the agent shall append it to the agent failure log path in [quality-gates.project.md](quality-gates.project.md).
- **QG-DEB-06.** When the same failure has three entries in that log, the agent shall open an investigation and shall record which guide or sensor in [controls.md](controls.md) must change so that failure is less likely. The agent shall not close the entry as an observation only.
- **QG-DEB-07.** The agent shall exclude an unrelated pre-existing failure from the Spec Coverage Gate and shall include that same failure in this gate.
