# Requirements: kit-playbook

## Traceability
- Capability: [capability.md](./capability.md) · Spec (lite, before escalation): [spec.md](./spec.md)

## EARS Requirements

### REQ-001 — Playbook (P1)
**Ubiquitous:** The kit shall have `docs/PLAYBOOK.md` with the sections of the spec-drift playbook, naming only commands
`asdd help` lists, linked from the README, `cli/README.md`, and the spec-drift playbook.

### REQ-002 — Version 3.11.0 (P1)
**Event-driven:** When a project re-runs `asdd install`, every kit artifact shall carry version 3.11.0; spec-drift and
knowledge shall report 1.1.0.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | The file exists with 12 plays and the three links. |
| AC-002 | REQ-002 | `npm test` (versions check) passes; spec-drift health returns 1.1.0 in its e2e. |
