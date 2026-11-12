# Spec Validation Report: spec-drift-apps

**Author:** asdd-pipeline (this session) · **Model/Tool:** claude-opus-5-5

## Gate Decision
PASSED

## Summary
4 MUST requirements, each with an acceptance criterion; anti-pattern score 1.0. The read-only constraint (README:
"the MCP server never writes" triage) is carried into REQ-002/003/004 and the no-gos.

## Findings
### BLOCKED
None.
### WARN
None.
### INFO
| ID | Requirement | Finding | Severity |
|----|-------------|---------|----------|
| VAL-001 | REQ-001 | The MCP SDK validates non-error `structuredContent` against `outputSchema`; a schema stricter than a real payload would turn a working tool into an error. Schemas must be loose objects over the known fields | INFO |

## Anti-Pattern Score
1.0

## Uncertainty Factors
- VAL-001: payload variants (paged results, `{error}` payloads, compacted fields) — mitigated by validating real e2e results.

## Validation Confidence Score
0.85

## Recommendation
PROCEED
