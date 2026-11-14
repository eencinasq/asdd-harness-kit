# Intent: rule-coverage

## Source

- **Pitch ID:** ad-hoc — `tools/spec-drift/docs/ROADMAP.md` priority **P1** (P1.1 ADR coverage, P1.2 validate generated rules)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-12: "continue with p1 in a new slice")

## Problem

The analysis groups drift by ADR, but nothing says which decisions no rule enforces: an ADR without a rule is a decision
nobody watches, and a rule citing a missing or superseded ADR enforces a decision that no longer stands. Rules the agent
generates (`generate-architecture-rules`) are only checked for syntax: no test shows a rule flags what it should and
nothing else, and nothing shows how many hits it has before the team accepts it. Test fixtures placed in `.semgrep/`
would also be scanned as code (Semgrep scans that folder), polluting the analysis, the PR review, and the kit's audit.

## Desired Outcome

The Tech Lead sees ADR coverage (covered, uncovered, dangling references) and can ask the agent for the rule an ADR
lacks; generated rules come with tests, and `validate_rules` says, per rule, whether it is valid, tested, passing, and
how noisy it is on the repo — before anyone accepts it. Fixtures never count as findings.

## Must-have outcomes

- MH-01 ADR coverage: discovery of the project's ADR files, coverage by rule metadata, uncovered and dangling lists, a
  rule prompt per uncovered ADR; tool `adr_coverage`, MCP prompt `write-adr-rule`, a dashboard tab.
- MH-02 Rule tests: authoring guide and prompts require a test file per rule file and `semgrep --test`; `.semgrep/` is
  excluded from every scan.
- MH-03 `validate_rules`: per rule valid / test / hits / flags and a readiness verdict; per-rule test status in the
  dashboard.

## Mapped files

`tools/spec-drift/src/analysis/**`, `tools/spec-drift/src/pr-review/architecture/architecture-scan.service.ts`,
`tools/spec-drift/ui/analysis-dashboard/**`, `tools/spec-drift/ui/analysis-dashboard.html`, `tools/spec-drift/test/**`,
`tools/spec-drift/README.md`, `tools/spec-drift/docs/ROADMAP.md`, `cli/src/harness/semgrep-lib.mjs`,
`cli/src/harness/semgrep-lib.test.mjs`, `tools/spec-drift/src/harness/semgrep-lib.mjs`, `cli/steering/spec-drift.md`,
`.harness/steering/spec-drift.md`

## No-gos

The server writes no rule, test, or ADR file (the agent does, in the host, at the user's request); ADR content is not
judged (only its id, title, status, and enforcement marker are read); no new engine.
