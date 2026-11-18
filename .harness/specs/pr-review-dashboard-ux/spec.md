# pr-review-dashboard-ux — Spec (hotfix)

## Intent

The PR Review dashboard (MCP App) buries coverage behind a permanent tab, spends a KPI slot on revision metadata that belongs in the header, and never surfaces the built-in security pack scan (`architecture.builtinSecurity`) the way Architecture is shown.

Make review-progress a clickable KPI that opens a same-UI drill-down with Back; put revision number and date next to the PR number in the header; replace the Revision KPI with a Security Findings KPI; remove the old Coverage tab and add a Security Findings tab fed by `builtinSecurity`. Add a Code coverage KPI/tab that runs JS/TS unit tests with Istanbul-style coverage when configured, or asks the agent to set that up (same pattern as Security).

Mapped: `tools/spec-drift/ui/pr-review.html`, `tools/spec-drift/ui/pr-review/main.ts`, `tools/spec-drift/ui/shared/styles.css`, `tools/spec-drift/test/ui.e2e-spec.ts`, plus `tools/spec-drift/src/pr-review/` coverage scan paths in tasks.

## Requirements

- **REQ-001.** WHEN the reviewer clicks the Coverage KPI, the dashboard shall show the coverage detail in the same UI with a Back control, and the Coverage tab shall not appear in the tab list.
- **REQ-002.** The header meta line shall show the revision number and its date after the pull request number, and the Revision KPI card shall not appear.
- **REQ-003.** The dashboard shall show a Security Findings KPI card (same pattern as Architecture) driven by the PR security scan (built-in and/or repository security set).
- **REQ-004.** The tab list shall include a Security Findings tab that lists security scan findings (or an empty/skipped state), and shall not include a Coverage tab.
- **REQ-005.** The Security Findings tab shall show the built-in security pack section first when that scan ran.
- **REQ-006.** WHEN the repository has a security rule set (e.g. `.semgrep/security/`), the Security Findings tab shall show those scan findings after the built-in section.
- **REQ-007.** WHEN the repository has no security rule set, the Security Findings tab shall offer a control that sends the host agent a prompt to generate security rules from security best practices for the codebase’s area, then rescan.
- **REQ-008.** WHEN the engine is Semgrep and the PR has scannable files, the built-in security pack shall always run on the PR files, including when the repository already has a security rule set.
- **REQ-009.** WHEN the Security Findings tab is shown and the repository has no security rule set (including a legacy architecture scan that omits `repoSecurity`), the dashboard shall show **Ask the agent to write security rules**.
- **REQ-010.** The Coverage drill-down shall open with a plain-language summary of review progress (batches done / remaining).
- **REQ-011.** WHEN the agent has submitted findings, the Coverage drill-down shall show those findings before the batch list, and shall label rule docs in human-readable form.
- **REQ-012.** Batches that share the same review rule shall be grouped under one scannable section.
- **REQ-013.** The Architecture and Security Findings KPI cards shall open their tab when clicked; when project or security rules are missing, the card hint shall invite generating rules.
- **REQ-014.** The dashboard shall show a Code coverage KPI card and a Code coverage tab with an Istanbul-style summary for JS/TS.
- **REQ-015.** WHEN the reviewed repository has a JS/TS unit-test runner and coverage tooling configured, the review shall run those tests with coverage and show the resulting report (overall % and per-file rows for PR paths when available).
- **REQ-016.** WHEN the reviewed repository has no usable JS/TS test+coverage configuration, the Code coverage tab shall offer a control that sends the host agent a prompt to add unit tests and coverage (Jest, Vitest, or c8/nyc), then rescan.
- **REQ-017.** The Code coverage tab shall always show a Rescan control (same pattern as Security Findings), including when the review has no `codeCoverage` artifact yet or status is missing.
- **REQ-018.** The Inline comments KPI card shall be clickable and open the Comments tab.
- **REQ-019.** The dashboard shall always show the Ticket criteria KPI and the Requirements tab; WHEN no ticket is attached, they shall show an empty/missing state and invite attaching a ticket (same pattern as Architecture / Security / Code coverage).
- **REQ-020.** The Reload control shall sit with Review progress (same reload behavior as before).
- **REQ-021.** Reload and Review progress shall live in the header as a compact control (progress still opens the drill-down); the KPI row shall keep the other cards clickable and shall not include Review progress or Reload.
- **REQ-022.** The dashboard shall show a Findings tab that lists Architecture, Security, and Ticket-evidence items with filters, severity/source/`file:line`/message/checkbox, and actions Add selected, Add all high, and Skip (clear selection). Existing Architecture/Security/Requirements tabs remain for detail and rescan.
- **REQ-023.** Adding Findings to comments shall use a short template (source + rule/criterion + message, optional suggested fix) truncated to the inline word limit; high/critical severity defaults to checked; Security uses the same add-to-comments path as Architecture.
- **REQ-024.** Ticket criteria remain a checklist in the review summary; unmet criteria with `path:line` evidence may be pinned as inline comments.
- **REQ-025.** Before publish, the confirmation shall preview inline count, summary-note count, and suggested event, with an easy undo of the last Findings add.
