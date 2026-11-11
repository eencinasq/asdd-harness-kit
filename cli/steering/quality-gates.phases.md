---
inclusion: auto
tags:
  - discovery
  - spec
  - validation
  - domain
  - design
  - task_planning
classification: portable
---

# Quality Gates — phase gates

Per-phase acceptance criteria. Shared machinery — gate actions, decision rules (`QG-DEC-*`), and gate states — lives in [quality-gates.md](quality-gates.md); the binding lives in [quality-gates.project.md](quality-gates.project.md).

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

## Design Readiness Gate

The slice shall enter task planning only when this gate returns PASS.

### Acceptance criteria

- **QG-DES-01.** When the design confidence score is greater than or equal to 0.85, requirements status is `READY`, and the validation gate decision is `PASSED` or `PASSED_WITH_WARNINGS`, the agent shall return PASS for this gate.
- **QG-DES-02.** When the design confidence score is less than 0.85, the agent shall return BLOCK and shall require a design revision.
- **QG-DES-03.** If requirements status is any value other than `READY`, then the agent shall return BLOCK.
- **QG-DES-04.** If the validation gate decision is any value other than `PASSED` or `PASSED_WITH_WARNINGS`, the agent shall return BLOCK.

## Task Planning Readiness Gate

Bounds for the task planning confidence score: below 0.70, from 0.70 inclusive to below 0.85, and greater than or equal to 0.85.

### Acceptance criteria

- **QG-TPL-01.** When the task planning confidence score is greater than or equal to 0.85 and design status is `READY`, the agent shall return PASS for this gate.
- **QG-TPL-02.** When the task planning confidence score is greater than or equal to 0.70 and less than 0.85, the agent shall return WARN and shall list each uncertainty factor that produced the score.
- **QG-TPL-03.** When the task planning confidence score is less than 0.70, the agent shall return BLOCK and shall return the slice to the design phase.
- **QG-TPL-04.** If design status is any value other than `READY`, then the agent shall return BLOCK.

## Negative space

- No decision machinery — gate actions, `QG-DEC-*`, and gate states live in [quality-gates.md](quality-gates.md); this file is phase criteria only.
- No execution or learning gates — those live in `quality-gates.exec.md` / `quality-gates.learn.md`.
- No project commands or values — `quality-gates.project.md` binding supplies them (`QG-DEC-08`).

## Enforcement

The applying agent named per gate self-applies the criteria and records the result in the manifest `gates` block (`QG-DEC-09`); scores come from the phase's evidence and the named skills — no score is invented or rounded across a bound (`QG-DEC-06`).

## Escalation

Gate states per the core: WARN → Tech Lead `override` session before advancing; BLOCK → remediate and re-evaluate; lite slices skip this file entirely (`QG-DEC-07`).
