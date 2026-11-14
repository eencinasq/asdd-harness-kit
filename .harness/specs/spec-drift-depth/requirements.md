# Requirements: spec-drift-depth

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — Traceability matrix (P1)
**Event-driven:** When `traceability_matrix` runs (optionally for one slice, only rows with gaps, or as Markdown), the
server shall return, from the kit's knowledge index, one row per requirement with its slice, id, title, implementing
features and their status, owned files (folders expanded to tracked files), test files among them, and the PR numbers
of commits that touched them, plus the gaps `no-feature`, `no-test`, and `not-passing` and the totals, writing nothing;
without `.harness/` or without the index it shall return "no data" naming `asdd knowledge sync`; the audit dashboard
shall show the matrix in a Traceability tab.

### REQ-002 — PR risk (P1)
**Event-driven:** When `pr_review_start` prepares a review, the server shall score each changed file as
`churn + 2 × requirement links + 5 × findings` (the formula of `asdd audit` hotspots), where churn is the commits that
touched it in the last 90 days, requirement links are the requirement ids of the repository's features whose scope
covers it, and findings are this PR's architecture findings on it plus those of the latest `.harness/audits/` report;
it shall rank the files with a level (high: any finding or score ≥ 10; medium: score ≥ 4; low) and the reasons, name the
top files in the review prompt as the files to read first, and return the same ranking in `pr_review_status` and the
dashboard; a source that is missing counts 0 and is reported as unavailable.

### REQ-003 — Dependency-graph rules (P1)
**State-driven:** While the analyzed repository's `.harness/steering/domain-layer.project.md` has a `Dependency layers`
table (`Layer | Paths | May depend on`), every analysis that includes architecture shall also run a `dependencies` pack
whose rules are `dep-layer` (a file of one layer imports a file of a layer not in its "May depend on" list) and
`dep-cycle` (files that import each other in a cycle, unless the binding says `**Dependency cycles:** allow`), checked
over the import graph of JavaScript/TypeScript (relative imports and `tsconfig` `paths`), Python, Go, Java, and Kotlin,
and reported as findings at the import line, with baseline, trend, and dashboard like any other rule, through the
`CodeAnalyzer` port; without the table there shall be no such pack; the binding template shall document the table.

### REQ-004 — Long runs and structured questions (P2)
**Event-driven:** When `analysis_start` is called with the input of the analysis tools, the server shall start the scan
in the background and return a job id at once, and `analysis_job` shall return the job's status, its last progress
message, and, when done, the result the analysis tool returns in the foreground; jobs live only in the server process (at
most 20; finished jobs expire after one hour).
**State-driven:** While the client declares the `elicitation` capability on a protocol 2026-07-28 request,
`pr_review_publish` shall ask the user to confirm (PR number and comment count) before creating the pending review and
shall publish nothing when declined, and `pr_review_start` without a `ticket` and without a previous ticket shall ask
for the ticket key or URL (suggesting a reference found in the PR) and continue without one when the answer is blank,
declined, or cancelled; without that capability both tools shall behave as before.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | Unit: rows, folder expansion, test detection, PR numbers from commit subjects, gaps, totals, Markdown. E2E: matrix over a fixture with a knowledge index and git history; no data without index; the Traceability tab renders. |
| AC-002 | REQ-002 | Unit: score, level, ranking, reasons, unavailable sources. E2E: `pr_review_start` on a fixture PR returns the ranking with churn, links, and findings; the prompt names the first file; status returns the same. |
| AC-003 | REQ-003 | Unit: table parsing, import extraction and resolution per language, layer violations, cycles, `allow`. E2E: analysis of a fixture with the table reports `dep-layer` and `dep-cycle` next to Semgrep findings; without the table no pack. |
| AC-004 | REQ-004 | Unit: job store limits and expiry. E2E: `analysis_start` returns a job id at once and `analysis_job` returns the scan result; a client with elicitation confirms/declines publish and answers/skips the ticket; a client without it gets today's behavior. |
