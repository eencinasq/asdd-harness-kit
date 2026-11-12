# Requirements: spec-drift-empty

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — No rules is not a pass (P1)
**Unwanted behavior:** If the analyzed repository has no rules for the requested mode (and no packs were named), then
`analyze_architecture`, `analyze_standards`, `analyze_spec_drift`, and `rescan` shall return a non-error result with
status `no-rules`, zero findings, a message saying nothing was analyzed, and a rules-generation prompt, and shall not
say the code matches the spec.

### REQ-002 — Offer to generate rules (P1)
**Event-driven:** When an analysis result has status `no-rules`, the analysis dashboard shall show a "no rules" state
with an "Ask the agent to write rules" action that sends the rules-generation prompt to the host agent, and the server
shall offer the same prompt as the MCP prompt `generate-architecture-rules`. The prompt shall tell the agent to derive the
rules from this codebase, write them under `.semgrep/architecture/` and `.semgrep/standards/`, use the kit's steering
and ADRs when `.harness/` exists, and validate them.

### REQ-003 — The audit uses generated rules (P2)
**Universal:** The kit's architecture check shall select `.semgrep/architecture/` when no bound or file config exists,
and when it has no rules, `verify_architecture_rules` and `audit_diff` shall include the rules-generation prompt.

### REQ-004 — No data is not an error (P1)
**State-driven:** While the harness root has no `.harness/` folder, `audit_diff`, `verify_architecture_rules`,
`verify_spec_compliance`, `audit_report`, `audit_query`, and `learning_report` shall return a non-error result with
`no_data` (reason and next step) and no findings. While the kit is installed but there is no audit report, no active
slice, no source to query, or no learning data, the corresponding tool shall return `no_data` instead of an error, and
the audit dashboard shall show "No data" with the reason.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | On an empty repo, the four analysis tools return `isError: false`, `status: "no-rules"`, `findingCount: 0`, a `generatePrompt`, and text without "No violations" (e2e). |
| AC-002 | REQ-002 | `generate-architecture-rules` lists and returns the prompt naming `.semgrep/architecture/`; the dashboard model shows the no-rules state with the action (e2e + unit). |
| AC-003 | REQ-003 | `resolveSemgrepConfig` selects `.semgrep/architecture` when only that folder exists (unit); `verify_architecture_rules` on a kit repo without rules carries `generate_prompt` (e2e). |
| AC-004 | REQ-004 | On a repo without `.harness/`, the six tools return `isError: false` with `no_data`; with the kit and no report, `audit_report` returns `no_data`; outputs validate against their schemas (e2e); the dashboard model renders "No data" (unit). |
