# Spec Validation Report: spec-drift-demand

## Gate Decision
PASSED

## Summary
REQ-001…006 (each with an acceptance criterion) and capability.md validated; AP-6 and AP-7 resolved.

## Findings

### BLOCKED
None.

### WARN
| ID | Requirement | Note |
|----|-------------|------|
| VAL-001 | REQ-005 | The CodeQL CLI is not installed on this machine: the adapter is verified with a fake process runner, not against real CodeQL output. |

### INFO
| ID | Requirement | Note |
|----|-------------|------|
| VAL-002 | REQ-004 | A pending review belongs to the token that created it; with the Action's own token a human could not submit it, so the workflow authenticates `gh` with a reviewer's personal token secret. |
| VAL-003 | REQ-003 | The server cannot see model tokens; it records the text it returned, with an estimate. |

## Confidence
Validation confidence 0.8.
