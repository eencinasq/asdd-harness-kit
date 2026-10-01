---
inclusion: always
---

# Quality Gates

Portable acceptance criteria for spec coverage, cumulative confidence, design readiness, task planning readiness, domain placement, and tech debt. These criteria are normative. The agent applying a gate shall apply them as written.

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

## Cumulative Confidence Score (CCS)

CCS is the score recorded for the slice at the phase under evaluation. Bounds partition every value: below 0.50, from 0.50 through 0.65 inclusive, and above 0.65.

### Acceptance criteria

- **QG-CCS-01.** When CCS is less than 0.50, the agent shall return BLOCK and shall send the spec back for rework.
- **QG-CCS-02.** When CCS is greater than or equal to 0.50 and less than or equal to 0.65, the agent shall return WARN and shall list each uncertainty factor that produced the score.
- **QG-CCS-03.** When CCS is greater than 0.65, the agent shall return PASS for this gate.

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
