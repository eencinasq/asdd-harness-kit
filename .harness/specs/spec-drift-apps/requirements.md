# Requirements: spec-drift-apps

## Traceability
- Capability: [capability.md](./capability.md)
- Slice: spec-drift-apps (full)

## EARS Requirements

### REQ-001 — Typed results
**Universal:** Every audit tool (`audit_diff`, `verify_architecture_rules`, `verify_spec_compliance`, `generate_ci_gate`,
`audit_report`, `audit_finding`), every analysis tool (`analyze_architecture`, `analyze_standards`, `analyze_spec_drift`,
`list_rule_packs`, `rescan`), and the new `audit_query` and `learning_report` shall declare an `outputSchema`, and each
non-error result they return shall validate against it.

### REQ-002 — Read-only learning view
**Event-driven:** When `learning_report` is called, the server shall return every learning pattern (id, signature, kind,
occurrences, status, slices) and every steering proposal (id, pattern, status, and the list of fields it still lacks,
computed by the same function the CLI's `QG-LEARN-03` check uses), each with the next `asdd` command, and shall write no
file.

### REQ-003 — Triage stays with the CLI
**Universal:** The audit view shall show the exact `asdd triage <id> --dismiss --reason "<reason>"` (and, in review mode,
`--confirm`) command for a human to run, and shall not send a triage request to the model; the server shall expose no
tool that writes `.harness/audits/triage.json`.

### REQ-004 — Server-side query
**Event-driven:** When `audit_query` is called with filters (slice, severity, check, source, path prefix) and a
`group_by` (slice, severity, check, path, none), the server shall return the total, the counts per group, and at most
`limit` matching findings from the chosen source (the latest `audit_diff` of this process, else the latest audit report,
else a fresh drift check), and shall write no file.

## Priority Matrix
| ID | Priority | Status |
|----|----------|--------|
| REQ-001 | MUST | READY |
| REQ-002 | MUST | READY |
| REQ-003 | MUST | READY |
| REQ-004 | MUST | READY |

## Acceptance Criteria
### AC-001 — REQ-001
**Given** the server **When** a client lists tools and calls them on the e2e sandbox **Then** the 13 tools carry
`outputSchema` and their results validate (the SDK rejects a result that does not).
### AC-002 — REQ-002
**Given** a repo with an open pattern and an unfilled proposal **When** `learning_report` runs **Then** the pattern and
the proposal appear, the proposal lists `control` and `success` as missing, the next command is `asdd learn --propose
<LP>` for an unproposed pattern, and no file changed.
### AC-003 — REQ-003
**Given** the audit view model **When** a dismissal is requested **Then** it yields the `asdd triage … --dismiss --reason`
command and no host message; the server's tool list has no triage-writing tool.
### AC-004 — REQ-004
**Given** findings from several slices and severities **When** `audit_query` runs with `group_by: "slice"` and a severity
filter **Then** the counts match the filtered findings, at most `limit` findings return, and no file changed.

## Out of Scope
- Code Mode hosting; PR-review tool schemas; any server write.
