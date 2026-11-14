# Requirements: spec-drift-demand

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — Drift origin (P1)
**Event-driven:** When `drift_origin` runs for a repository path and line, the server shall return, read-only, the commit
that last changed that line (sha, author, date, subject, PR number from the subject) and the oldest commit whose diff
added that line's text, or an error naming the path or line that does not exist.

### REQ-002 — Guided fix (P2)
**Event-driven:** When the `fix-rule-violations` prompt is requested for a rule (optionally a maximum), the server shall
return a prompt listing that rule's current violations (path, line, message, ADR) with the instruction to fix them in the
host after the user confirms, and to rescan those paths; the analysis dashboard shall offer **Ask the agent to fix** on
each drifting rule; the server writes nothing.

### REQ-003 — Review cost and time (P2)
**Event-driven:** When a review is published, the metrics line shall record the minutes since `pr_review_start`, the
review tool calls by name, and the characters of text those calls returned (with a token estimate at 4 characters per
token); `pr_review_metrics` shall report their medians.

### REQ-004 — CI mode (P2)
**Event-driven:** When `spec-drift ci-review` runs, it shall print a GitHub Actions workflow that, on a pull request, runs
Claude Code (`anthropics/claude-code-action@v1`) with this server and a prompt that reviews the PR and creates only a
pending review, with `gh` authenticated by a reviewer's token secret so the reviewer can submit it; and the server shall
keep `GH_TOKEN` for `gh` when `CI=true`.

### REQ-005 — CodeQL engine (P3)
**State-driven:** While `SPEC_DRIFT_ENGINE=codeql`, the analysis shall run through a `CodeqlAnalyzer` behind the
`CodeAnalyzer` port: queries under `<repo>/codeql/` (folders as sets, `.ql` / `.qls` as packs), metadata from the query
header (`@id`, `@name`, `@problem.severity`, `adr:` tag), `codeql database create` then `database analyze` to SARIF,
mapped to findings; a missing `codeql` CLI shall fail the scan with a message naming it.

### REQ-006 — Multi-repo overview (P3)
**Event-driven:** When `repos_overview` runs, the server shall return, for each repository in `SPEC_DRIFT_REPOS`, its
latest analysis snapshot totals, trend direction, latest audit drift level and spec compliance, and "no data" for a
repository without them, writing nothing.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | Unit: blame porcelain parsing, PR from subject. E2E: origin of a line in a fixture repo (two commits, a PR subject); unknown path and line are errors. |
| AC-002 | REQ-002 | Unit: prompt lists violations and the confirm/rescan steps. E2E: the prompt over a Semgrep fixture; UI: the button sends the prompt to the host. |
| AC-003 | REQ-003 | Unit: cost from the call log; medians. E2E: a published review's metrics line has minutes, calls, characters. |
| AC-004 | REQ-004 | Unit: the workflow parses as YAML, uses the action, the token secret, the MCP config, and a pending-only prompt. E2E: the CLI prints it; `GH_TOKEN` reaches `gh` only with `CI=true`. |
| AC-005 | REQ-005 | Unit: query metadata, packs, SARIF mapping, command arguments, missing CLI (fake runner; CodeQL is not installed here). E2E: the server starts with the engine and lists CodeQL packs. |
| AC-006 | REQ-006 | Unit: summary per repo. E2E: two fixture repos, one without data. |
