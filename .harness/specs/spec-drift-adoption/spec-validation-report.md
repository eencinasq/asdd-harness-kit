# Spec Validation Report: spec-drift-adoption

## Gate Decision
PASSED

## Summary
REQ-001…004 (MUST, each with an acceptance criterion) and capability.md validated; AP-4 and AP-7 resolved.

## Findings

### BLOCKED
None.

### WARN
None.

### INFO
| ID | Requirement | Note |
|----|-------------|------|
| VAL-001 | REQ-001/002 | The read-only invariant holds for the MCP server process; `baseline` and `record` are CLI commands of the same package, run by a person or CI, like `asdd triage` for the kit. |
| VAL-002 | REQ-004 | The Tech Lead chose "guide only": no package publishing; the generated config points at the kit checkout. |

## Confidence
Validation confidence 0.85.
