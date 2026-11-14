# spec-drift

**spec-drift** (formerly "Architecture MCP"; one name for the folder, the package, and the server) is an MCP server
(NestJS) that gives an AI agent three jobs, each with an interactive dashboard (MCP App):

1. **Static analysis.** Runs a repo's architecture and coding-standard rule packs and reports **spec
   drift**: which ADR / `AGENTS.md` rules the code breaks today. The engine is pluggable — **Semgrep** by
   default, replaceable by e.g. CodeQL ([Analyzer engines](#analyzer-engines)).
2. **PR review.** A project- and language-agnostic GitHub PR review: the diff is split into review groups
   (one rule checklist per language or file type), the agent reviews them one by one, re-checks its findings, optionally
   verifies the ticket's acceptance criteria, and leaves a **pending** review for a human to edit and submit.
   It also runs the repo's own `.semgrep/` rules on the PR files.
3. **Harness audit.** The read-only governance view of a repo with the
   [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit) installed (formerly the `spec-drift-auditor`
   server): spec drift `DRIFT-01…07` on a diff, architecture rules, spec compliance per slice, CI gate text, and
   codebase audit reports. Every check is the harness's own logic, vendored into `src/harness/` and bundled, so chat, hooks and CI agree and the
   server needs nothing from the project but its data under `.harness/`.

**How and when to use it:** see the [Playbook](docs/PLAYBOOK.md). This README is the reference.

## Install in 5 minutes

From a checkout of [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit) (the server is not published as a
package; it runs from the checkout):

```bash
cd asdd-harness-kit/tools/spec-drift
nvm install && corepack enable && pnpm install && pnpm build    # Node 24 (.nvmrc), pnpm
brew install semgrep && gh auth login                           # analysis / PR review (see Requirements)
node bin/spec-drift.mjs config --client cursor                  # or claude-code, claude-desktop
```

`spec-drift config` prints the configuration for that client with every path already resolved — this checkout's
launcher (`bin/mcp-stdio`), the folders of `node`, `semgrep`, `gh` and `git` on `PATH`, and the project roots — and says
where to paste it. Nothing to edit by hand:

- **Cursor:** without `--project`, the roots are `${workspaceFolder}`, so one config follows the open folder.
- **Claude Code:** it prints a `claude mcp add …` command; run it inside the project (`$PWD` is the root).
- **Claude Desktop:** pass `--project /path/to/repo`, or leave it out and let the agent pass `repoPath`.
- **Fewer tools:** `--toolsets analysis,review` loads only those jobs ([Toolsets](#toolsets)).

Restart the client (Cursor: Settings → MCP, toggle the server). The sections under [Connect a client](#connect-a-client)
explain what the generated config contains.

## Toolsets

`SPEC_DRIFT_TOOLSETS` (comma-separated; all three when unset) loads only the tools, prompts and dashboards of the jobs a
team uses — fewer tools in every model call, fewer wrong picks:

| Toolset    | Loads                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analysis` | `analyze_*`, `rescan`, `list_rule_packs`, `adr_coverage`, `validate_rules`, `drift_trend`, `analysis_start`, `analysis_job`, `drift_origin`, `repos_overview`; the analysis dashboard; its prompts |
| `review`   | `pr_review_*`; the PR Review dashboard; `review-pr`                                                                                                                                                |
| `audit`    | `audit_*`, `verify_*`, `generate_ci_gate`, `learning_report`, `traceability_matrix`; the audit dashboard; `spec://` resources; its prompts                                                         |

The services stay loaded whatever the toolsets (the audit and the PR review use the analysis services). An unknown name
stops the server with the valid ones.

## Requirements

| Need                   | Check                                        | Used for                                 |
| ---------------------- | -------------------------------------------- | ---------------------------------------- |
| Node **24.22.2** (nvm) | `nvm use` in this directory (`.nvmrc`)       | the server (`engines: >=24.22.1`)        |
| pnpm 12                | `corepack enable` or `npm i -g pnpm`         | install / build                          |
| Semgrep                | `semgrep --version` (`brew install semgrep`) | analysis tools, PR architecture scan     |
| GitHub CLI, logged in  | `gh auth status`                             | PR review (diff, issues, pending review) |
| git                    | `git --version`                              | PR review, drift origin, traceability    |
| CodeQL CLI (optional)  | `codeql version`                             | only with `SPEC_DRIFT_ENGINE=codeql`     |

```bash
nvm install && pnpm install && pnpm build
```

## Tools

40 tools (all toolsets). Five are **dashboard-only** (`visibility: ["app"]`): the dashboard calls them, and hosts that
support MCP Apps visibility hide them from the model.

**Typed results.** Every analysis and harness-audit tool declares an `outputSchema` (zod, in `*.output.ts`), and
its `structuredContent` validates against it; clients — including code-mode hosts that generate a typed API from
the tool list — know each result's shape. The schemas are loose objects over the known fields, so a new field
never turns a result into an error; `{ error }` results are tool errors (`isError`) and carry no schema.

### Static analysis

| Tool                   | Result    | Purpose                                                                                                                   |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `analyze_spec_drift`   | dashboard | Every rule pack; drift grouped by rule / ADR (`mode`, `packs`, `paths`, `severity`)                                       |
| `analyze_architecture` | dashboard | The `architecture/` set only                                                                                              |
| `analyze_standards`    | dashboard | The `standards/` set only                                                                                                 |
| `list_rule_packs`      | text      | Sets and packs discovered under `<repo>/.semgrep/`                                                                        |
| `rescan`               | app-only  | Re-run from the dashboard                                                                                                 |
| `adr_coverage`         | text      | Which ADRs a rule enforces (`metadata.adr`): coverage, uncovered ADRs (each with a rule prompt), dangling rule references |
| `validate_rules`       | text      | Before accepting rules: per rule, test result (`semgrep --test`), hits and files on the repo, flags, ready or not         |
| `analysis_start`       | text      | Start a scan in the background (same input as `analyze_spec_drift`); returns a job id at once                             |
| `analysis_job`         | text      | A background scan's status, last progress message and, when done, the same result as the analyze tool; no id lists jobs   |
| `drift_origin`         | text      | Why a finding is there: the commit that last changed its line (blame) and the oldest commit that added its text, with PR  |
| `repos_overview`       | text      | Several repositories (`SPEC_DRIFT_REPOS`): latest snapshot, trend direction, audit level and spec compliance per repo     |

**No rules is not a pass.** When the repo has no rules for the mode (no `.semgrep/architecture/` for
`analyze_architecture`, nothing under `.semgrep/` for `analyze_spec_drift`), the result has `status: "no-rules"`, no
findings, and a `generatePrompt`: the dashboard shows **Ask the agent to write rules** (and **Copy prompt**), and the
text asks the model to offer it to the user. The prompt has the agent derive the rules from this codebase — and, when the
repo has `.harness/`, from its steering bindings and ADRs — into `.semgrep/architecture/` and `.semgrep/standards/`, list
them for the user to confirm, and validate them. The same prompt is the MCP prompt `generate-architecture-rules`. The
agent writes the files in the host; this server writes nothing. A pack named in `packs` that does not exist is still an
input error.

**Rules come with tests.** The authoring guide (and so every rule prompt) asks for a test file next to each rule file —
`boundaries.yml` → `boundaries.ts`, with `ruleid: <id>` above a line the rule must flag and `ok: <id>` above one it must
not — and a passing `semgrep --test .semgrep`. `.semgrep/` is never scanned as code (those fixtures violate the rules on
purpose): the analysis, the PR review and the kit's audit pass `--exclude .semgrep` and drop explicit paths under it,
because Semgrep does not apply `--exclude` to named targets. Every scan summary carries `ruleTests` (passed / failed per
tested rule) and the dashboard shows a test badge per rule. `validate_rules` turns that into a verdict: a rule is
**ready** when its test passes and it is not noisy (≥ 50 hits or hits in ≥ 20 files); no test, a failing test, tests
that could not run (no Semgrep) and noise each keep it out.

**ADR coverage.** `adr_coverage` (and the dashboard's **ADRs** tab, from every scan) reads the project's ADR files — the
`ADR index` row of `.harness/steering/structure.md`, else `.adr-dir`, else `docs/decisions`, `docs/adr`, `docs/adrs`,
`doc/adr`, `docs/architecture/decisions` or `adr` — and matches them to the rules' `metadata.adr` by number (`ADR-10` =
`ADR-0010` = `0010-x.md`). It reports the ratio over active, enforceable ADRs (superseded, deprecated and rejected ones
do not count; an ADR with `Enforcement: manual` is exempt), the ADRs no rule enforces — each with **Ask the agent to
write the rule** and the MCP prompt `write-adr-rule` — and rules citing an ADR that has no file or no longer stands.

### PR review

| Tool                                        | Result       | Purpose                                                                                              |
| ------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `pr_review_start`                           | text         | Fetch the PR, split it into groups, scan `.semgrep/`, return the review prompt (+ optional `ticket`) |
| `pr_review_next_group`                      | text         | Hand out the next group (or `groupIndex`): its diff, rules and commentable lines                     |
| `pr_review_submit_findings`                 | text         | Findings for one group → draft; names the next step                                                  |
| `pr_review_read_file` / `pr_review_search`  | text         | Read (200 lines a page) / `git grep` (50 matches) code **at the PR head**                            |
| `pr_review_verify_findings`                 | text         | Verification pass: confirmed / plausible / rejected per finding                                      |
| `pr_review_set_ticket`                      | text         | Attach the ticket (Jira / Linear text, GitHub issue, pasted text)                                    |
| `pr_review_submit_requirements`             | text         | Final step with a ticket: a verdict per criterion                                                    |
| `pr_review_metrics`                         | text         | Kept / edited / removed rates of published reviews, by severity and rule                             |
| `pr_review_cleanup`                         | text         | Remove a review's local artifacts                                                                    |
| `pr_review_status`                          | PR dashboard | Open the dashboard (once, when coverage is complete)                                                 |
| `pr_review_save_draft`                      | PR dashboard | Save hand-written `report.md` / `comments.md` (bypasses the loop)                                    |
| `pr_review_architecture_rescan`             | PR dashboard | Re-run the repo's rules on the PR files                                                              |
| `pr_review_import_architecture`             | PR dashboard | Turn architecture findings into PR comments                                                          |
| `pr_review_publish`                         | PR dashboard | Create a **pending** review (visible only to you)                                                    |
| `pr_review_ui_save` / `pr_review_ui_reload` | app-only     | Dashboard persistence                                                                                |
| `pr_review_ui_publish`                      | app-only     | **Submit** the review — a human clicks it, with a confirmation step                                  |
| `pr_review_ui_requirements`                 | app-only     | A human corrects criterion verdicts                                                                  |

**Dependency-graph rules.** Semgrep matches import strings, so it cannot resolve `../../infra/db` to a layer or see a
cycle. When the analyzed repo's `.harness/steering/domain-layer.project.md` has a `Dependency layers` table, every
architecture or full analysis also runs a `dependencies` pack built from it:

```markdown
## Dependency layers

| Layer          | Paths                | May depend on       |
| -------------- | -------------------- | ------------------- |
| Domain         | `src/domain/**`      | —                   |
| Application    | `src/application/**` | Domain              |
| Infrastructure | `src/infra/**`       | Domain, Application |
```

`dep-layer` (ERROR) flags an import from one layer into a layer it may not depend on; `dep-cycle` (WARNING) flags files
that import each other in a cycle (`**Dependency cycles:** allow` turns it off). Imports are read from JavaScript /
TypeScript (relative paths, `index` files, `.js` specifiers of `.ts` files, `tsconfig` `paths`), Python, Go (`go.mod`
module) and Java / Kotlin (package imports) and resolved to repository files; packages are ignored. TypeScript
`import type` counts for layers, not for cycles (it is erased at runtime). The findings sit at the import line, so the
baseline, the trend, the dashboard and the PR review treat them like any rule; in a PR review only the PR's files are
checked for layers (a cycle needs the whole graph). Without the table there is no pack. The kit's binding template
documents the table.

**Where a drift came from, and fixing it.** `drift_origin` takes a finding's path and line and returns the commit that
last changed the line (`git blame`) and the oldest commit whose diff added its text (`git log -S`), each with author,
date, subject and PR number. Each drifting rule in the dashboard has **Ask the agent to fix** (and the MCP prompt
`fix-rule-violations`): a request listing that rule's violations, asking the agent to show its plan and wait for the
user's confirmation, fix the cause without silencing the rule, and rescan the changed paths. The agent edits; the server
only reads.

**Several repositories.** Set `SPEC_DRIFT_REPOS` to a comma-separated list of repository paths and `repos_overview`
summarizes each from its files — the latest `spec-drift record` snapshot and its trend, the latest `asdd audit` report —
without running a scan.

**Long scans in the background.** A full scan of a large repository can take minutes. `analysis_start` takes the same
input as `analyze_spec_drift`, starts the scan, and returns a job id at once; `analysis_job` returns its status and last
progress message, and — when done — the same result the analyze tool returns. Jobs live in this server process (at most
20; a finished job is kept an hour). MCP Tasks are not used: protocol revision 2026-07-28, which this server speaks,
removed them.

### Harness audit

Over the repo at `HARNESS_ROOT` (default: the working directory). All read-only: these tools write nothing to the
repository. Each except `audit_query` opens the audit dashboard (`ui://spec-drift/audit-dashboard.html`) and returns
the same JSON as text.

**Decisions stay at the CLI.** Triage and proposal decisions are the Tech Lead's and are recorded by the `asdd` CLI, not
by this server: in review mode the dashboard's **Dismiss…** and **Confirm** show the exact
`asdd triage <id> --dismiss --reason "…"` / `--confirm` command to copy into a terminal, and the learning view shows
`asdd learn --propose <LP>` and what each proposal still lacks. No tool writes `.harness/audits/triage.json` or a
proposal, so a model — on a host that ignores app-only visibility — cannot silence a finding.

**No data is not an error.** Without the kit (no `.harness/` in `HARNESS_ROOT`), every tool below except
`generate_ci_gate` and `audit_finding` returns `no_data: { reason, next }` and no findings, and the dashboard shows
**No data**. With the kit but nothing recorded yet, `audit_report` (no report: run `asdd audit`),
`verify_spec_compliance` (no slices), `audit_query` (no source to query), and `learning_report` (no incidents or
proposals) do the same. When the architecture check finds no Semgrep rules, `verify_architecture_rules` and the
`architecture` block of `audit_diff` carry `generate_prompt`, and the architecture card offers **Ask the agent to write
rules**; the kit's audit selects the `.semgrep/architecture/` folder that prompt writes.

| Tool                        | Purpose                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_diff`                | Spec drift (`DRIFT-01…07`) and architecture rules on a diff; `mode: "review"` adds `DRIFT-07` and applies Tech Lead triage                                                                                                            |
| `verify_architecture_rules` | Bound Gate command + Semgrep (the binding, `.semgrep.yml`, the `.semgrep/architecture/` folder, or rules generated from the boundary table); `source` returns one source text                                                         |
| `verify_spec_compliance`    | Per slice: the `ears` adapter plus enabled module adapters (e.g. `openapi`)                                                                                                                                                           |
| `generate_ci_gate`          | GitHub / GitLab job text that runs `asdd check`; writes nothing                                                                                                                                                                       |
| `audit_report`              | Latest `.harness/audits/` report, filtered by `severity` / `since`                                                                                                                                                                    |
| `audit_finding`             | One finding with its knowledge-graph trace (REQ → feature → file)                                                                                                                                                                     |
| `audit_query`               | Filter (slice, severity, check, source, path prefix) and group (slice, severity, check, top-level path) findings on the server: totals, per-group counts, at most `limit` findings. Text only — use it to summarize instead of paging |
| `learning_report`           | The self-improving loop: patterns, steering proposals with the fields each still lacks, and the `asdd` command a human runs next                                                                                                      |
| `traceability_matrix`       | Requirement → features (status) → owned files → tests → PRs, one row per requirement from the knowledge index, with gaps (`no-feature`, `no-test`, `not-passing`), totals, and a Markdown table; `slice_id`, `gaps_only`              |

Results stay under 8 KB (Cursor stops mounting MCP Apps above about 13 KB): larger ones carry the first findings,
full counts and a `page.token`; call the same tool with `page_token` and `offset` for the rest. Source texts are
left out unless `include_text: true`.

**Traceability matrix.** `traceability_matrix` answers the audit question "which requirement does this code implement,
which test proves it, which PR brought it": one row per requirement of the kit's knowledge index (`asdd knowledge sync`),
with the features that implement it and their status, the files they own (folders and globs expanded to tracked files),
the test files among them, and the PR numbers of the commits that touched them (from squash `(#N)` and
`Merge pull request #N` subjects, the latest 5 000 commits, no network). Gaps: `no-feature`, `no-test`, `not-passing`.
The dashboard shows it with **Copy as Markdown**; without an index the result is **No data** naming
`asdd knowledge sync`.

### Prompts and resources

| Primitive         | Name                                                                         | Purpose                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Prompt            | `review-pr` (`pr`, `repoPath?`, `focus?`, `ticket?`)                         | Slash command that runs the whole review                                                                                       |
| Prompt            | `spec-drift-report` (`paths?`, `severity?`)                                  | Slash command for a drift report grouped by ADR                                                                                |
| Prompt            | `generate-architecture-rules`                                                | Have the agent write `.semgrep/architecture/` and `.semgrep/standards/` rules from this codebase (and its harness ADRs)        |
| Prompt            | `write-adr-rule` (`adr_id`)                                                  | Have the agent encode one ADR no rule enforces as a rule with a test                                                           |
| Prompt            | `fix-rule-violations` (`rule_id`, `max?`)                                    | Have the agent fix a rule's current violations (after you confirm its plan) and rescan                                         |
| Prompt            | `architecture-review` (`paths?`)                                             | Harness: inferential architecture review (codebase-audit skill)                                                                |
| Prompt            | `spec-alignment` (`slice_id`)                                                | Harness: per-REQ satisfied / violated / unclear for one slice                                                                  |
| Prompt            | `pr-review` (`base_branch`, `target_branch`, `pr_body?`)                     | Harness: Tech Lead drift review of a branch, draft comments only (not the GitHub `review-pr`)                                  |
| Resource          | `spec://manifest`, `spec://rules/architecture`, `spec://drift/latest-report` | Harness registry and slice manifests, bound architecture rules, latest drift report                                            |
| Resource template | `pr-review://{project}/{pr}/{file}`                                          | `diff.patch`, `report.md`, `comments.md`, `units.json`, `architecture.json`, `requirements.json`, `findings.sarif` of a review |

In Claude Code the prompts are `/mcp__spec-drift__review-pr` and
`/mcp__spec-drift__spec-drift-report`.

## How a PR review works

```
pr_review_start (+ ticket)
  └─ loop, no UI:  pr_review_next_group → pr_review_submit_findings      (one per group; parallel with groupIndex)
  └─ pr_review_verify_findings                                            (when there are findings)
  └─ pr_review_submit_requirements                                        (when there is a ticket)
pr_review_status → dashboard → human edits → pr_review_publish (pending) → human submits
```

1. **Prepare.** `gh pr view` / `gh pr diff`, `git fetch`, the repo's [review profile](#review-profile)
   (from the base branch), then prepare: parse → filter (binaries, secrets, lockfiles, generated /
   minified / vendored files, single-file diffs over 400k chars) → resolve a system rule per file (test files
   get the tests checklist) → bundle into **groups** of up to 20k diff characters, files of a directory
   together; a larger file is split into parts by hunk. The repo's `.semgrep/` rules run on the PR files,
   read from a temporary snapshot of the PR head. A committed secrets file becomes a finding without its
   content ever reaching the model.
2. **Group loop.** `pr_review_next_group` is the only call that hands out a group: its diff, the rule
   checklist (each item with an id such as `python.performance`), what the repo's `.semgrep/` rules found in
   those files, and the lines a comment may anchor to. Each finding quotes its line(s) (`existingCode`) and
   cites a `ruleId`, with `confidence` (0–100) and `evidence`. Groups are independent, so subagents can take
   one each.
3. **Verification.** Every finding is re-checked on its own (ideally by a fresh subagent), with the code
   around it: **confirmed** findings are posted, **plausible** ones move to the summary as "worth a look",
   **rejected** ones are dropped (listed in `report.md`).
4. **Ticket** (optional). One verdict per acceptance criterion / definition-of-done item: met, partial,
   unmet or unverifiable, with `path:line` evidence. See [Reviewing against the ticket](#reviewing-against-the-ticket).
5. **Human.** `pr_review_status` opens the dashboard (Comments, Requirements, Coverage, Architecture, Report).
   You edit, then publish: the model can only create a **pending** review; the visible review (APPROVE /
   REQUEST_CHANGES / COMMENT) is submitted by you on GitHub or with **Submit review…** in the dashboard.

The suggested decision is a **quality gate**: critical / high findings (or an unmet ticket criterion) →
REQUEST_CHANGES; APPROVE only with no findings **and** every file reviewed — a file skipped as too large or
as a secrets file is listed under "Not reviewed" and turns APPROVE into COMMENT.

Publishing is blocked until every step is done. Each step is saved to disk, so a review survives restarts
and works across clients.

**Read first.** `pr_review_start` ranks the changed files by risk with the formula of `asdd audit` hotspots —
`churn + 2 × requirement links + 5 × findings` — where churn is the commits that touched the file in the last 90 days
(base branch history), requirement links are the requirement ids of the repo's features (`.harness/features/`) whose
scope covers it, and findings are this PR's architecture findings plus the latest `.harness/audits/` report's. A file is
**high** with any finding or a score of 10, **medium** from 4. The prompt names the top files to read first, the text
says it in one line, and the Coverage tab shows them with their reasons; sources a repo does not have count 0 and are
listed. The group order does not change.

**Cost and time.** Every review tool call is logged in the review's `calls.jsonl` (tool, characters returned, time).
At publish, the metrics line gets `cost`: minutes since the last `pr_review_start`, calls by tool, characters, and an
estimate of the tokens the host read from this server (characters / 4 — the server cannot see the model's own tokens).
`pr_review_metrics` reports the medians.

**Structured questions.** On a client that declares the MCP `elicitation` capability (protocol 2026-07-28),
`pr_review_start` without a ticket asks for one (suggesting a reference found in the PR; blank or declined reviews without
it), and `pr_review_publish` asks to confirm before creating the pending review (declined: nothing is published). Other
clients — and 2025-era connections, which this stateless server cannot ask — behave as before.

### What keeps the review precise and cheap

- **Quote-first anchoring.** A finding goes where its quoted code (`existingCode`) is in the diff; the line
  number only picks between repeated matches. Without a match it may move at most 3 lines; otherwise it is
  not anchored (the agent is told to resubmit it with a quote) — never pinned to an unrelated line. A
  finding whose anchor moved loses its `suggestion` block, which would otherwise replace the wrong lines.
  Ranges are trimmed to the diff; findings on a renamed file's old path get the new path.
- **The PR's code, never the checkout.** Diffs come from GitHub; other code is read with
  `pr_review_read_file` / `pr_review_search` (`git show` / `git grep` at the PR head commit, fetched as
  `pull/<n>/head`). Your working tree, index and branch are never touched.
- **Calibrated prompt.** Severity definitions and examples of a good finding vs noise; "precision over
  recall". The diff, PR comments and ticket are wrapped as **untrusted data**.
- **No repeats.** Inline comments already on the PR are shown to the agent, and findings that restate one
  (same file, ±3 lines, similar text) are dropped. A **re-review** lists what changed since the last head and
  the previous comments to re-check.
- **Each piece of context reaches the model once.** Loop steps return a compact coverage line, not the
  paths, ticket criteria or group table again, and their `structuredContent` is only the progress.
  `pnpm measure:context` prints what a full loop returns per tool call.
- **Metrics.** Every publish appends to `metrics.jsonl` (in `PR_REVIEW_ROOT`, default
  `~/.local/state/pr-review/`): how many drafted comments humans kept, edited or removed, by severity and
  checklist item. `pr_review_metrics` summarizes them and names the noisiest items. In a repo with the
  asdd-harness-kit, `asdd learn` records that project's reviews (counts per checklist item, no comment text) in the
  committed weekly learning summaries, so the whole team's review quality shows in `learning_report`, and a rule whose
  comments humans keep removing becomes a `review:<rule>` noise pattern.
- **Stable fingerprints.** Each finding gets a fingerprint (path + rule + the code it is on, not the line
  number). A re-review's report says what is **new**, **still open** and **gone** since the last one.
- **SARIF.** Each draft also writes `findings.sarif` (SARIF 2.1.0), the format of GitHub code scanning and
  CodeQL. To track the findings as code-scanning alerts, a human uploads it:
  `gh api repos/OWNER/REPO/code-scanning/sarifs -f commit_sha=<head> -f ref=refs/pull/<n>/head -f sarif="$(gzip -c findings.sarif | base64)"`.
- **Offline evaluation.** [`eval/`](eval/README.md) scores the reviewer on 35 labelled cases (9 languages, a third
  clean; checked in `pnpm test`): precision, recall and F1 per language and category, compared with a saved baseline
  (`pnpm eval score … --baseline`, exit 1 on a drop). `pnpm eval harvest` turns your published reviews into private
  cases.

### Review profile

Like a SonarQube quality profile, a repo can tune its review with `.pr-review.yml` at its root. It is read
from the **base** branch, so a PR cannot switch off the checks that review it. All keys are optional:

```yaml
reviewTests: true # review test files with the tests checklist (false: skip them)
addedLinesOnly: false # comment only on lines the PR added ("clean as you code")
exclude: ["legacy/**"] # extra paths to skip
disable: [python.performance, matlab] # checklist items (or whole rule docs) to drop
summaryOnly: [ts_js_tsx_jsx.dead-code] # report these in the summary only
severity: { go.errors-panics-and-api-contracts: high }
```

Item ids are shown in each group's checklist (`#### [python.performance] Performance`). An invalid
profile is ignored with a warning in `pr_review_start`.

### Reviewing against the ticket

Pass the ticket the PR implements and the review also checks **what was asked**:

- **Sources.** The server holds no Jira / Linear credentials: the agent reads the ticket with its own tools
  (e.g. the Atlassian MCP) and passes its text. GitHub issues are fetched with `gh` (`#45`,
  `owner/repo#45`, URL). Pasted text works too. Without a ticket, the review spots references (`MLC-123` in
  the title or branch, `Closes #45` in the body) and suggests `pr_review_set_ticket`.
- **Criteria** are read from the text: AC / DoD headings in English or Spanish (`Acceptance criteria`,
  `Criterios de aceptación`, `Definition of done`, `Definición de terminado`, Jira `h3.`…), bullet /
  numbered / checkbox lists and Gherkin scenarios. Pass `criteria` explicitly for other shapes.
- **Definition-of-done facts** (tests, docs, migrations, config changed) come from the diff, not the model.
- **Result.** The summary gets a compact checklist (between `<!-- requirements -->` markers, so your edits
  around it survive), `report.md` a full table, the dashboard a **Requirements** tab where you can correct
  any verdict. An unmet criterion suggests _Request changes_; you decide.

```
/review-pr pr: 828 ticket: MLC-123      # the agent reads MLC-123 with its Jira tools
/review-pr pr: 828 ticket: #45          # GitHub issue, fetched by the server
/review-pr pr: 828 ticket: "## Criterios de aceptación\n- …"
```

### Where things live

| What               | Where                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Rules (Semgrep)    | `<repo>/.semgrep/<set>/<pack>.yml` — every top-level folder is a set, every YAML file a pack                   |
| Review artifacts   | `<repo>/.pr-review/pr-<N>/` if that folder exists or is gitignored, else `$PR_REVIEW_ROOT/<repo-name>/pr-<N>/` |
| Review profile     | `<repo>/.pr-review.yml`, read from the base branch                                                             |
| Previous revisions | same folder, renamed on a re-review: `report.v1.md`, `comments.v1.md`, `diff.v1.patch`, `progress.v1.json`     |
| Metrics            | `$PR_REVIEW_ROOT/metrics.jsonl` (default `~/.local/state/pr-review/`)                                          |

`mode: architecture` / `standards` run the folder of that name; `spec-drift` / `all` run every set. The
analysis tools scan `ANALYSIS_REPO_ROOT`; the PR review always uses the **reviewed repo's** rules. When it has
none, the Architecture tab offers a prompt for the agent to write them from the codebase, then **Rescan**.

## Connect a client

Every client starts the server through **`bin/mcp-stdio`**. GUI apps don't load nvm and start servers from an
arbitrary directory, so the launcher picks the Node from `.nvmrc` (override with `MCP_NODE=/path/to/node`),
points tsx at this project's `tsconfig.json` (needed for Nest decorators) and keeps stdout clean for the
protocol. `node bin/spec-drift.mjs config --client <client>` writes these blocks for you with the paths resolved; the
examples below show their shape (`/path/to/spec-drift` is this directory).

**Which repo it works on.** Clients start the server outside your project, so tell it which repo to use:
`PR_REVIEW_REPO` (PR review) and `ANALYSIS_REPO_ROOT` (analysis), or let the agent pass `repoPath`.

### Cursor

Per project — **recommended** — in `<project>/.cursor/mcp.json`, so both variables follow the open folder:

```json
{
	"mcpServers": {
		"spec-drift": {
			"command": "/path/to/spec-drift/bin/mcp-stdio",
			"env": {
				"PR_REVIEW_REPO": "${workspaceFolder}",
				"ANALYSIS_REPO_ROOT": "${workspaceFolder}",
				"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
			}
		}
	}
}
```

`PATH` lets the server find `semgrep`, `gh` and `git` installed with Homebrew. For every project, use
`~/.cursor/mcp.json` with an absolute `PR_REVIEW_REPO` (or none, and ask for `repoPath`). Then **Cursor
Settings → MCP**: the server shows its tools; toggle it off/on after changing the config or rebuilding. Use
**Agent** mode. Cursor renders the dashboards.

### Claude Code

```bash
claude mcp add spec-drift -e PR_REVIEW_REPO="$PWD" -e ANALYSIS_REPO_ROOT="$PWD" \
  -- /path/to/spec-drift/bin/mcp-stdio            # this project (~/.claude.json)
claude mcp add spec-drift --scope user -- /path/to/spec-drift/bin/mcp-stdio  # all projects
claude mcp list                                                  # spec-drift … ✔ Connected
```

`--scope project` writes a shared `.mcp.json` into the repo (teammates need this server at the same path).
`/mcp` shows the server, its tools and any connection error. Claude Code is a terminal: tools return their
text, the dashboards don't render — edit `comments.md` in the review folder instead, or open the review in
another client.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (Settings → Developer → Edit Config), then
quit and reopen Claude:

```json
{
	"mcpServers": {
		"spec-drift": {
			"command": "/path/to/spec-drift/bin/mcp-stdio",
			"env": { "PR_REVIEW_REPO": "/path/to/repo", "ANALYSIS_REPO_ROOT": "/path/to/repo" }
		}
	}
}
```

Logs: `~/Library/Logs/Claude/mcp-server-spec-drift.log`.

### Over HTTP

Run `pnpm serve` (keep it running) and point the client at `http://localhost:3010/mcp`:

```bash
claude mcp add --transport http spec-drift-http http://localhost:3010/mcp
```

```json
{ "mcpServers": { "spec-drift-http": { "url": "http://localhost:3010/mcp" } } }
```

`PR_REVIEW_REPO` / `ANALYSIS_REPO_ROOT` then come from the shell that runs `pnpm serve`. With `MCP_API_KEY`
set, send it as `X-Api-Key` (`-H "X-Api-Key: …"`, or `"headers"` in Cursor).

### Share it (npm package)

`pnpm build && pnpm pack` produces a tarball whose `spec-drift` bin runs the compiled bundle with
plain Node (no tsx, nvm or absolute paths):

```json
{
	"mcpServers": {
		"spec-drift": { "command": "npx", "args": ["-y", "spec-drift"] }
	}
}
```

The package is `private` until it is published to a registry (e.g. GitHub Packages). Use the `npx`
config only after publishing it there, with npm pointed at that registry: an unscoped `spec-drift` would
otherwise resolve to whatever package of that name is on the public npm registry.

## Review in CI

```bash
node bin/spec-drift.mjs ci-review --kit-repo <owner>/asdd-harness-kit --kit-ref <commit> > .github/workflows/spec-drift-review.yml
```

prints a GitHub Actions workflow (it writes nothing): on a ready pull request (or by hand with a PR number) it builds this
server from the kit, installs Semgrep, and runs Claude Code (`anthropics/claude-code-action@v1`) with only the review
tools allowed and a prompt that ends in `pr_review_publish` — a **pending** review. A pending review belongs to the token
that created it, so `gh` runs with `SPEC_DRIFT_REVIEWER_TOKEN`, a fine-grained token of the person who submits reviews:
they find the draft on the PR and submit it, edit it, or drop it. Secrets: `ANTHROPIC_API_KEY` and
`SPEC_DRIFT_REVIEWER_TOKEN`. Drafts and fork PRs are skipped. With `CI=true` the server keeps `GH_TOKEN` for `gh`
(locally it drops it, because a stale GUI token breaks `gh`).

## Baseline and trend

Two commands a person (or a CI job) runs — the MCP server only reads what they write, and both files are meant to be
committed:

```bash
node bin/spec-drift.mjs baseline --repo /path/to/repo           # dry run: what it would accept
node bin/spec-drift.mjs baseline --repo /path/to/repo --write   # .semgrep/baseline.json
node bin/spec-drift.mjs record --repo /path/to/repo             # .semgrep/history/<date>.json (one per day)
```

- **Baseline.** On a legacy repo the first scan shows every existing violation. `baseline --write` accepts them: each
  finding is fingerprinted by rule, path, and the normalized text of its line, so a moved line stays existing and an
  edited one becomes new. Every scan then marks each finding **new** or **existing** and counts **resolved** ones
  (whole-repository scans only); the dashboard opens on new findings (**New / All**), and the text leads with them.
  Re-run `baseline --write` deliberately (after a reformat, every line is new).
- **Trend.** `record` writes a snapshot of a whole-repository scan (totals, per rule / ADR / pack / severity, new
  findings, ADR coverage, the commit). `drift_trend` compares the snapshots — or the kit's `.harness/audits/` reports with
  `source: "audit"` — and answers whether drift is going **down (better)**, **up (worse)** or **flat** (within 5 %),
  with the rules / ADRs / checks / slices that moved most; the dashboard's **Trend** tab charts the last 12 snapshots
  (crosshair, table view). Record at the end of each sprint, or from a scheduled CI job that commits the file.

## Configuration

Validated at startup (`src/config/env.schema.ts`); an invalid value stops the server with a clear error.

| Variable                       | Default                     | Purpose                                                                             |
| ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `PR_REVIEW_REPO`               | working directory           | Repo reviewed when a call omits `repoPath`                                          |
| `ANALYSIS_REPO_ROOT`           | working directory           | Repo whose `.semgrep/` packs the analysis tools run (old name `SEMGREP_REPO_ROOT`)  |
| `HARNESS_ROOT`                 | working directory           | Repo with `.harness/` that the audit tools check                                    |
| `HARNESS_SEMGREP`              | `semgrep`                   | Semgrep binary for `verify_architecture_rules`                                      |
| `HARNESS_GATE_TIMEOUT_SECONDS` | `120`                       | Kill the bound architecture Gate command after this long                            |
| `PR_REVIEW_ROOT`               | `$XDG_STATE_HOME/pr-review` | Review artifacts when the repo has no `.pr-review/`; metrics                        |
| `XDG_STATE_HOME`               | `~/.local/state`            | Base of the default `PR_REVIEW_ROOT`                                                |
| `COMMAND_TIMEOUT_SECONDS`      | `120`                       | Kill a `git` / `gh` command after this long                                         |
| `ANALYSIS_TIMEOUT_SECONDS`     | `600`                       | Kill a whole analyzer run (old name `SEMGREP_TIMEOUT_SECONDS`)                      |
| `PORT` / `HOST`                | `3010` / `127.0.0.1`        | HTTP transport                                                                      |
| `MCP_API_KEY`                  | —                           | HTTP shared secret (≥ 16 chars); **required** when `HOST` is not loopback           |
| `MCP_ALLOWED_ORIGINS`          | —                           | Extra browser origins allowed on `/mcp` (comma-separated); localhost always allowed |
| `SPEC_DRIFT_TOOLSETS`          | all                         | `analysis`, `review`, `audit` to load ([Toolsets](#toolsets))                       |
| `SPEC_DRIFT_ENGINE`            | `semgrep`                   | `codeql` to run the analysis on CodeQL queries under `codeql/`                      |
| `CODEQL_LANGUAGE`              | detected                    | CodeQL extractor (e.g. `javascript-typescript`, `python`, `java-kotlin`)            |
| `SPEC_DRIFT_REPOS`             | the analyzed repo           | Repositories for `repos_overview` (comma-separated paths)                           |
| `MCP_NODE`                     | Node from `.nvmrc`          | Node binary used by `bin/mcp-stdio`                                                 |

### Security model

The tools act with **your** `gh` and `git` credentials:

- **The model cannot post a visible review.** `pr_review_publish` only creates a pending review;
  `pr_review_ui_publish` (submit) is dashboard-only and asks for confirmation. A prompt-injected PR can at
  most leave you a draft.
- **Read-only on your repo.** It runs `git fetch` and reads commits; it never checks out, commits or pushes. The
  harness-audit tools write nothing (triage and proposals are recorded with `asdd triage` / `asdd learn`).
- **HTTP** binds to `127.0.0.1`; foreign `Origin`s and non-localhost `Host` headers get 403 (no driving tools
  from a web page, no DNS rebinding); another bind address requires `MCP_API_KEY`.
- **External commands** run without a shell, with `--` before user-supplied paths, literal pathspecs,
  non-interactively (`GIT_TERMINAL_PROMPT=0`, SSH `BatchMode`), with timeouts, and are killed when the client
  cancels. Paths in tool input must be repo-relative (no `..`, no leading `-`).
- **State:** atomic writes and a per-PR lock that also works across server processes.

## Analyzer engines

Tools, dashboards and the PR review never call Semgrep directly. They use the `CodeAnalyzer` port
([`src/analysis/ports/code-analyzer.port.ts`](src/analysis/ports/code-analyzer.port.ts)); the engine is
chosen in `app.module.ts`:

```ts
AnalysisModule.forRoot(); // Semgrep (default)
AnalysisModule.forRoot({ engine: CodeqlEngineModule }); // any module that provides CODE_ANALYZER
```

| Method                | Semgrep adapter                                  | A CodeQL adapter would                                                         |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `inspect(repoRoot)`   | does `<repo>/.semgrep/` exist, which rule files  | same for e.g. `<repo>/codeql/` (`.ql` / `.qls`)                                |
| `listPacks(repoRoot)` | top-level folders = sets, YAML files = packs     | folders = sets, query suites or queries = packs                                |
| `loadRules(packs)`    | parse YAML `rules:` (id, severity, message, ADR) | read query metadata (`@id`, `@problem.severity`, `@name`, tags)                |
| `run(request)`        | `semgrep --config … --json -- <paths>`           | `codeql database create` + `database analyze --format=sarif-latest`, map SARIF |
| `authoringGuide()`    | how to write Semgrep rules                       | how to write CodeQL queries                                                    |

**CodeQL.** `SPEC_DRIFT_ENGINE=codeql` switches to the CodeQL adapter (`engines/codeql/`): queries under
`<repo>/codeql/` (top-level folders are sets, `.ql` / `.qls` files packs), rule metadata from the QLDoc header (`@id`,
`@name`, `@problem.severity`, `adr:ADR-0007` in `@tags`), `codeql database create` (language from `CODEQL_LANGUAGE` or
the most common source language) and `codeql database analyze` to SARIF in a temporary folder. Without the `codeql` CLI
a scan fails with a message naming it. The adapter is tested with a stubbed CLI; it has not been run against a real
CodeQL installation in this repository's CI.

The Semgrep module wires a `CompositeAnalyzer`: Semgrep plus the dependency-graph engine
(`engines/dependencies/`), whose rules come from the `Dependency layers` table. Each pack goes to the engine that listed
it, findings are merged, and the engine identity, rule tests and rules folder stay Semgrep's.

The contract (relative paths never parsed as options; `run` resolves on violations and returns
`status: 'failed'` when the tool produced nothing; findings carry declared rule ids) is exercised by
[`analysis.service.spec.ts`](src/analysis/analysis.service.spec.ts) with an in-memory "CodeQL" engine.

## Develop

```bash
nvm use
pnpm build             # typecheck + dashboards (dist/*.html) + server bundle (dist/server/main.js)
pnpm stdio             # dev server over stdio (tsx)
pnpm serve             # dev server, http://127.0.0.1:3010/mcp (health: /health)
pnpm serve:prod        # compiled bundle, plain node
pnpm start             # watch mode
pnpm lint              # Biome (pnpm lint:fix to format)
pnpm typecheck
pnpm test              # unit: src/**/*.spec.ts + ui/**/*.spec.ts (~1 s)
pnpm test:e2e          # e2e (~1.5 min): tools, PR-review lifecycle, transports, security, dashboards in Chromium
pnpm smoke:analysis    # live scan of ANALYSIS_REPO_ROOT (needs semgrep)
pnpm measure:context   # what a full review loop returns to the model, per tool call
pnpm eval prepare      # offline evaluation: review groups of each labelled case (eval/README.md)
pnpm eval score results.json   # precision / recall / F1 of a run
pnpm inspect           # MCP Inspector web UI (http://127.0.0.1:6274), servers from mcp-inspector.json
pnpm inspect:cli --method tools/list
```

E2E tests build throwaway repos in the OS temp dir (`test/fixtures/sandbox.ts`) and put a fake `gh`
(`test/fixtures/bin/gh`) first on `PATH`, serving PR #42; nothing reaches GitHub or your real state
directory. The dashboard tests load the built views in headless Chromium inside a real MCP Apps host (run
`npx playwright install chromium` once). Suites skip themselves when `semgrep`, Chromium or `dist/` are missing.

### Project structure

```
src/
├── main.ts                    bootstrap: HTTP (/mcp, /health) or --stdio
├── app.module.ts              Config + MCP + feature modules, MCP error interceptor
├── config/                    zod-validated environment, paths
├── common/                    process runner (the only place that spawns git / gh / analyzers),
│                              HTTP guards, locks, atomic writes, MCP Apps helpers, elicitation
├── health/                    GET /health
├── cli/                       spec-drift baseline / record / config / ci-review (run once, no MCP)
├── analysis/                  AnalysisModule.forRoot({ engine })
│   ├── analysis.tools.ts / .prompts.ts / .service.ts / .schemas.ts / .presenter.ts / .types.ts
│   ├── ports/                 CodeAnalyzer port + CODE_ANALYZER token
│   ├── domain/                pure: pack selection, drift report, pack summary, baseline, trend, ADR coverage,
│   │                          rule readiness, drift origin, fix prompt, repos overview
│   ├── jobs/                  background scans (analysis_start / analysis_job), process memory
│   └── engines/               composite analyzer; semgrep/ (default), codeql/, dependencies/ (layer and cycle rules)
├── audit/                     harness audit (former spec-drift-auditor): tools, prompts, spec:// resources
│   ├── audit.service.ts       thin projection of the vendored harness checks (harness-libs.ts → src/harness/)
│   ├── domain/                pure: traceability matrix
│   └── audit-paging.ts        pure: fit results to the MCP App budget, page tokens
├── harness/                   GENERATED copies of cli/src/harness libs (drift, semgrep, audit, learning, knowledge store)
└── pr-review/
    ├── pr-review.tools.ts / .prompts.ts / .service.ts / .schemas.ts / .presenter.ts / .views.ts / .types.ts
    ├── workspace/             review folder, state, artifacts
    ├── github/                gh / git (PR metadata, diff, PR-head snapshots, git show / grep)
    ├── comments/              comments.md format and validation (shared with the UI)
    ├── architecture/          .semgrep scan of PR files, report, import into comments
    ├── coverage/              group-coverage state machine (groups → verify → requirements)
    ├── verification/          verification pass
    ├── requirements/          ticket → criteria, verdicts, summary block, TicketService
    ├── context/               per-group diff, code reading, existing comments, re-review
    ├── metrics/               kept / edited / removed and cost per published review; offline eval scoring
    ├── risk/                  changed files ranked by risk ("Read first")
    ├── prompt/                agent prompt with calibration examples
    └── engine/                review engine (third-party notices: THIRD_PARTY_NOTICES.md):
                               parse, filter, rules + item ids, bundling, anchoring, checks, profile, SARIF
ui/                            MCP App views (Vite → dist/), shared styles and Markdown renderer
test/                          e2e specs + fixtures (sandbox repos, fake gh, MCP Apps host)
bin/mcp-stdio                  stdio launcher for MCP clients
bin/spec-drift.mjs   package entry (compiled bundle)
scripts/                       server bundle build, analysis smoke, context measurement, eval
eval/                          labelled cases for the offline evaluation
docs/PLAYBOOK.md               how and when to use the server
```

Conventions: tools are thin (schema → one service call → presenter); services own I/O, pure modules don't and
are unit-tested next to the file; constructors use explicit `@Inject(Token)` (tsx and esbuild emit no
decorator metadata); Biome for lint/format; caller mistakes throw Nest exceptions, which
`McpErrorsInterceptor` turns into tool errors that keep their message; UI views import only pure modules.

## Troubleshooting

| Symptom                                                        | Fix                                                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Server fails to start / "Connection closed"                    | Run `bin/mcp-stdio < /dev/null` in a terminal: stderr says what is missing; no output and exit 0 means it starts.     |
| `Node v24.22.2 not found`                                      | `nvm install` here, or set `MCP_NODE` in the client's `env`.                                                          |
| `Parameter decorators only work when experimental decorators…` | Start through `bin/mcp-stdio`, not `node --import tsx src/main.ts` from another directory.                            |
| Client shows old behaviour / old dashboard                     | `pnpm build`, then restart the server in the client (Cursor: toggle it in Settings → MCP).                            |
| `git rev-parse --show-toplevel failed`                         | No repo to review: set `PR_REVIEW_REPO` or pass `repoPath`.                                                           |
| `gh auth login` in the error                                   | `gh auth login` (the server uses your `gh` session).                                                                  |
| `Bad credentials` / HTTP 401 from `gh`                         | A stale `GITHUB_TOKEN` / `GH_TOKEN` overrides `gh`'s login: unset it (or set it from `gh auth token`).                |
| Architecture: "Semgrep failed" / `semgrep: not found`          | Install Semgrep and make sure the client's `PATH` includes it (see the Cursor example).                               |
| `Another process is still working on …`                        | Another client is working on the same PR; retry. A crashed holder's lock is taken over automatically.                 |
| `… timed out after 120s`                                       | Raise `COMMAND_TIMEOUT_SECONDS` / `ANALYSIS_TIMEOUT_SECONDS`, or check that `git fetch` works without prompts.        |
| HTTP 403 / 401 on `/mcp`                                       | 403: `Origin` not allowed (`MCP_ALLOWED_ORIGINS`) or non-localhost `Host`. 401: missing / wrong `X-Api-Key`.          |
| Dashboards empty / resource read fails                         | `pnpm build` (views are served from `dist/`).                                                                         |
| Analysis says `no-rules`                                       | `ANALYSIS_REPO_ROOT` has no rules for that mode — check with `list_rule_packs`, or run `generate-architecture-rules`. |

`src/harness/` is generated by the kit's `asdd kit vendor` from `cli/src/harness`: never edit it here; edit the source and rerun it (`npm test` in the kit fails while a copy is stale).
