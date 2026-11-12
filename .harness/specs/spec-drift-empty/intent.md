# Intent: spec-drift-empty

## Source

- **Pitch ID:** ad-hoc (kit maintenance)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-12: the spec-drift MCP reviews the project's architecture with its
  Semgrep rules and, when it has none, the report offers to generate them with the agent from the existing codebase; it
  does code review; and when the MCP and the kit are used in the project, spec audit and analysis work — with no data it
  only shows "no data")

## Problem

On a project without `.semgrep/` rules, `analyze_spec_drift` reports "No violations — architecture/standards match the
encoded spec" (a false pass), and `analyze_architecture`, `analyze_standards`, and `rescan` fail with an error; only the
PR review offers to generate rules. On a project without the kit (`.harness/`), the audit tools report unfilled steering
files that do not exist, and with the kit but no data `audit_report` and `audit_query` return errors.

## Desired Outcome

No rules → the analysis says nothing was analyzed (never a pass) and offers to have the agent write rules from this
codebase (dashboard button, MCP prompt, and the tool text), and the audit picks those rules up. No kit or no data → the
audit tools return "no data" with the reason and the next step, not an error.

## Must-have outcomes

- MH-01 Analysis with no rules for the mode: a `no-rules` result (not an error, not a pass) with a rules-generation prompt
  for the agent; a dashboard state with "Ask the agent to write rules"; an MCP prompt `generate-architecture-rules`.
- MH-02 The audit's architecture check uses the generated `.semgrep/architecture/` folder, and offers the same prompt
  when it has no rules.
- MH-03 Audit tools return `no_data` (reason, next step) when the kit is not installed or there is nothing to show;
  the audit dashboard shows "No data".

## Mapped files

`tools/spec-drift/src/analysis/**`, `tools/spec-drift/src/audit/**`, `tools/spec-drift/src/pr-review/architecture/**`,
`tools/spec-drift/ui/analysis-dashboard/**`, `tools/spec-drift/ui/analysis-dashboard.html`,
`tools/spec-drift/ui/audit-dashboard/**`, `tools/spec-drift/test/**`, `tools/spec-drift/README.md`,
`cli/src/harness/semgrep-lib.mjs`, `cli/src/harness/semgrep-lib.test.mjs`, `tools/spec-drift/src/harness/semgrep-lib.mjs`,
`cli/steering/spec-drift.md`, `.harness/steering/spec-drift.md`

## No-gos

The server writes no repository file: the agent in the host writes the rules, at the user's request. No change to PR
review behavior. No triage or proposal writes.
