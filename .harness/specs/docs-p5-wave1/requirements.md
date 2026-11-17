# docs-p5-wave1 — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** The README drift table and notes shall state that DRIFT-02 checks only `in_progress` slices and that `docs/agent-failure-log.md` and `docs/dissent-log.md` are exempt from DRIFT-01.
- **REQ-002.** The README learning-gate table shall include QG-LEARN-10, and the README shall describe `asdd ui` (views, read-only default, the gate-decision write path and its Host/Origin checks) and `asdd skill-eval`.
- **REQ-003.** `cli/README.md` shall list `asdd ui`, `asdd gate-decide`, and `asdd skill-eval`.
- **REQ-004.** `docs/PLAYBOOK.md` shall have plays for deciding a gate from the UI and for changing a skill safely with `skill-eval --baseline`, and `cli/eval/skills/README.md` shall document the fixture format.
- **REQ-005.** `docs/ASDD-ROADMAP.md` shall mark P5.2, P5.3, P5.5, P5.6 done and G16, G18, G19 accordingly, and record the hotfixes that applied SP-003 and SP-006.
