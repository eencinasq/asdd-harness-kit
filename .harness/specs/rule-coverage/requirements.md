# Requirements: rule-coverage

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — ADR coverage (P1)
**Event-driven:** When `adr_coverage` runs, the server shall find the ADR folder of the analyzed repository (the
`ADR index` row of `.harness/steering/structure.md`, else `.adr-dir`, else the first existing of `docs/decisions`,
`docs/adr`, `docs/adrs`, `doc/adr`, `docs/architecture/decisions`, `adr`), read each ADR's id, title, status, and
enforcement marker, and return: every ADR with the rules citing it; the active, enforceable ADRs no rule cites; the
rules citing an ADR that is missing, superseded, or deprecated; and the coverage ratio — without writing any file.

### REQ-002 — Ask for the missing rule (P1)
**Event-driven:** When an active, enforceable ADR has no rule, the result shall carry a prompt that asks the host agent
to encode that ADR as a rule (with `metadata.adr`) and a test, the analysis dashboard shall offer it per ADR, and the
MCP prompt `write-adr-rule` (`adr_id`) shall return the same prompt.

### REQ-003 — Rules come with tests; fixtures are not code (P1)
**Universal:** The Semgrep authoring guide (and so `generate-architecture-rules`) shall require a test file per rule file
with `ruleid:` and `ok:` annotations and a passing `semgrep --test`; the analysis scan, the PR-review architecture scan,
and the kit's architecture check shall exclude the `.semgrep/` folder from the scanned code.

### REQ-004 — Validate rules before accepting them (P1)
**Event-driven:** When `validate_rules` runs, the server shall return, per rule: its file, pack, ADR, test status
(passed, failed, missing), hits and files hit on the repository, and flags (`invalid`, `no-test`, `test-failed`,
`noisy`), plus a readiness verdict per rule and counts; a missing analyzer binary shall be `unavailable`, never ready.

### REQ-005 — The dashboard shows coverage and tests (P2)
**Event-driven:** When an analysis result is shown, the dashboard shall show an ADR coverage tab (coverage, uncovered
ADRs with the ask action, dangling references) and, per rule in the drift tab, its test status.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | Unit: ADR discovery order, id/title/status/enforcement parsing (heading, file name, MADR front matter), numeric id matching (`ADR-10` = `ADR-0010`), coverage and dangling lists. E2E: `adr_coverage` on a fixture repo, schema-valid, writes nothing. |
| AC-002 | REQ-002 | Unit: the prompt names the ADR file, `metadata.adr`, the test file, and `semgrep --test`. E2E: `write-adr-rule` returns it. |
| AC-003 | REQ-003 | Unit: the authoring guide names the test annotations and `semgrep --test`. With Semgrep installed: a fixture in `.semgrep/` is not a finding of the analysis scan; kit unit: the scan args exclude `.semgrep`. |
| AC-004 | REQ-004 | Unit: readiness from a fixed test/hit input (passed+few hits → ready; missing test, failed test, noisy → not). With Semgrep installed (e2e): `validate_rules` on the sandbox reports passed / missing per rule. |
| AC-005 | REQ-005 | Unit: the dashboard view helpers produce the coverage rows, the ask action per uncovered ADR, and the test badge per rule. |
