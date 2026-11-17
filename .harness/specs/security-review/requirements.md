# Requirements: security-review

## Traceability
- Capability: [capability.md](./capability.md)
- Slice: security-review (full)

## EARS Requirements

### REQ-001 — Vendored methodology with attribution
**Universal:** The server shall ship the cloudflare/security-audit-skill checklists, `report-schema.json`, and
`validate-findings.cjs` under `tools/spec-drift/src/security/methodology/`, each with a header naming the source and the
modifications, and `THIRD_PARTY_NOTICES.md` shall reproduce the MIT license notice.

### REQ-002 — Reconnaissance and checklist selection
**Event-driven:** When `security_audit_start` is called, the server shall read the repository read-only (tracked files,
manifests, lockfiles, workflows, deployment files), report the detected languages and surfaces, select the applicable
checklists, start a run whose state lives outside the repository, and return a prompt of at most 8 000 characters with a
coverage ledger (one entry per selected checklist, status `pending`).

### REQ-003 — Checklist access
**Event-driven:** When `security_audit_checklist` is called with a checklist id, the server shall return that checklist's
text in pages of at most 6 000 characters; an unknown id shall return an error listing the valid ids.

### REQ-004 — Findings validation
**Event-driven:** When `security_audit_submit_findings` is called, the server shall validate the findings with the
vendored schema and validator (sorting them by fingerprint first), and shall reject, with every error, a submission whose
findings fail it; additionally every `trace` and `evidence` entry shall name a file that exists inside the repository and
a line within that file, else the submission is rejected.

### REQ-005 — Coverage ledger
**Event-driven:** When a valid submission names `checklists_reviewed`, the server shall mark those ledger entries
`reviewed` and store the findings (confirmed, needs_validation, rejected) in the run state, merging by fingerprint.

### REQ-006 — Static baseline
**Event-driven:** When `analyze_security` is called, the server shall run the repository's `security` rule set with the
configured engine; IF the repository has none and the engine is Semgrep, THEN it shall run the built-in starter pack
shipped with the server, and shall label which one ran. No model is involved.

### REQ-007 — PR review security lens
**Event-driven:** When a PR review group's files or diff touch a security-relevant surface (auth, crypto,
deserialization, SQL/command/path building, HTTP handlers, secrets, CI workflows, dependency manifests), the next-group
instruction shall include a `<security>` block naming the applicable checklists and the evidence a security finding
needs.

### REQ-008 — PR security findings need evidence
**Event-driven:** When `pr_review_submit_findings` receives a finding with `category: security`, the server shall keep it
only if its `evidence` names an affected principal or trust boundary and at least one `file:line` location; otherwise it
shall skip the finding and return a warning that says what is missing.

### REQ-009 — Security dashboard
**Event-driven:** When `security_audit_status` is called, the server shall return the run summary (findings by verdict
and severity, ledger coverage, needs-validation items) in a structured result of at most 8 KB, paged, rendered by the
security MCP App view; the PR review view shall mark security findings.

### REQ-010 — Execution safety and toolset
**Universal:** Every security tool shall be read-only on the repository (no target execution, no network, no file
writes in the repository), its description and prompt shall state those rules, and the security audit tools shall load
under a `security` toolset of `SPEC_DRIFT_TOOLSETS`.
