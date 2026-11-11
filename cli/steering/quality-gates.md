---
inclusion: auto
tags:
  - discovery
  - spec
  - validation
  - domain
  - design
  - task_planning
  - implementation
  - qa
  - knowledge
  - refactor
  - lite
classification: portable
---

# Quality Gates — core machinery

Portable gate machinery: gate actions, decision rules (`QG-DEC-*`), and gate states. These criteria are normative. The agent applying a gate shall apply them as written.

Gate tables are split by evaluation phase — load the file matching the phase under evaluation:

- Per-phase gates (Discovery, Spec, Validation, Domain, Design Readiness, Task Planning Readiness): [quality-gates.phases.md](quality-gates.phases.md)
- Execution gates (Spec Coverage, Domain Placement, Spec Drift, Tech Debt): [quality-gates.exec.md](quality-gates.exec.md)
- Learning gate (Knowledge phase): [quality-gates.learn.md](quality-gates.learn.md)

**Project binding (mandatory):** test commands, domain-placement findings, and stack paths live in [quality-gates.project.md](quality-gates.project.md). The agent shall apply this contract and that binding together.

**Actor:** the agent applying the gate — each gate names its applying agent in its file.

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
- **QG-DEC-09.** Before starting a phase, the agent shall read `gates` in the generated slice manifest. When the gate of the preceding phase is missing or BLOCK, the agent shall not start. When it is WARN, the agent shall start only after a Tech Lead `override` session for that phase (`acknowledged_by` in the gate). Domain is optional: when no domain gate exists, Design follows Validation. Refactor follows QA. `asdd check` reports violations as WARN.
- **QG-DEC-10.** Each agent shall record its phase confidence score and uncertainty factors in the session `evidence`. The agent shall log a confidence trend across phases as INFO only and shall not combine scores across phases into a gate decision.

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

## Negative space

- No gate criteria tables here — the three split files own phase criteria; this file owns only shared machinery.
- No project commands, test globs, paths, or severities — the `quality-gates.project.md` binding owns every project value (QG-DEC-08).
- No second confidence or coverage cutoff may exist in any agent prompt, skill, or steering file — this family is the only cutoff source (CTL-02).

## Enforcement

Self-applied: the applying agent names itself in each gate and records the result in the manifest `gates` block (`QG-DEC-09` chain); `asdd check` reports chain violations; gate outcomes and WARN concerns are durable session evidence (`QG-DEC-10`).

## Escalation

WARN requires a Tech Lead `override` session before advancing (`QG-GATE-04`); BLOCK requires remediation and re-evaluation (`QG-GATE-05`); an unfilled binding value is a BLOCK (`QG-DEC-08`), never an invented default. A criterion an agent believes wrong → steering proposal via the Learning Gate, not a local threshold edit (`QG-LEARN-07`).
