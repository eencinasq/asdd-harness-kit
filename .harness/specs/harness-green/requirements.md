# Requirements: harness-green

## Traceability
- Capability: [capability.md](./capability.md) · Spec (lite, before escalation): [spec.md](./spec.md)

## EARS Requirements

### REQ-001 — Green check (P1)
**Event-driven:** When `asdd check` and the kit's `npm test` run, they shall pass with the always-loaded steering budget
unchanged (31962 bytes) in the kit and in a project installed with the `http-api` module, and every feature reopened by
the refreshed copies shall be verified again with its own command.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | `npm test` exits 0; `asdd kit guidance` passes in the kit and in an installed project with `http-api`; each reopened feature's verification exits 0. |
