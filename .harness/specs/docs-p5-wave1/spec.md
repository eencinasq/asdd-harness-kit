# docs-p5-wave1 — Spec (lite)

## Intent

Document what P5 wave 1 shipped for humans, and correct two README statements the code no longer matches. The slice
records (specs, sessions, steering rules) already describe `asdd ui`, `asdd gate-decide`, `asdd skill-eval`, and
QG-LEARN-10; the human-facing docs do not, and the README still says DRIFT-02 runs on every slice (SP-003 limits it
to `in_progress` slices) and does not mention the DRIFT-01 exemption for the two harness logs (SP-006).
Documentation only; no behavior changes.

Mapped: `README.md`, `cli/README.md`, `docs/PLAYBOOK.md`, `docs/ASDD-ROADMAP.md`, `cli/eval/skills/README.md`

## Requirements

- **REQ-001.** The README drift table and notes shall state that DRIFT-02 checks only `in_progress` slices and that `docs/agent-failure-log.md` and `docs/dissent-log.md` are exempt from DRIFT-01.
- **REQ-002.** The README learning-gate table shall include QG-LEARN-10, and the README shall describe `asdd ui` (views, read-only default, the gate-decision write path and its Host/Origin checks) and `asdd skill-eval`.
- **REQ-003.** `cli/README.md` shall list `asdd ui`, `asdd gate-decide`, and `asdd skill-eval`.
- **REQ-004.** `docs/PLAYBOOK.md` shall have plays for deciding a gate from the UI and for changing a skill safely with `skill-eval --baseline`, and `cli/eval/skills/README.md` shall document the fixture format.
- **REQ-005.** `docs/ASDD-ROADMAP.md` shall mark P5.2, P5.3, P5.5, P5.6 done and G16, G18, G19 accordingly, and record the hotfixes that applied SP-003 and SP-006.
