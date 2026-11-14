# spec-drift — Playbook

How to use spec-drift (formerly "Architecture MCP") day to day: **what** it is for, **when** to reach for it, **where** to set
it up, and step-by-step plays for each situation. For tool details and configuration, see the
[README](../README.md). For the ASDD + Harness process itself (slices, sessions, checks), see the
[kit playbook](../../../docs/PLAYBOOK.md).

---

## 1. What it gives you

| Capability            | You ask for                              | You get                                                                               |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| **PR review**         | "Review PR 828"                          | A draft review: inline comments, summary and report, ready for you to edit and submit |
| **Ticket check**      | "Review PR 828 against MLC-123"          | The same, plus a verdict per acceptance criterion / definition-of-done item           |
| **Architecture scan** | (automatic in every PR review)           | The repo's own `.semgrep/` rules run on the PR's files                                |
| **Spec drift**        | "Which architecture rules are drifting?" | A dashboard of rule violations across the repo, grouped by ADR                        |
| **Review quality**    | "How useful have the reviews been?"      | How many drafted comments humans kept, edited or removed, and the noisiest rules      |
| **Read first**        | (automatic in every PR review)           | The changed files ranked by risk (churn, requirement links, findings)                 |
| **Drift origin**      | "Where did this finding come from?"      | The commit, author and PR that introduced the line                                    |
| **Guided fix**        | "Fix the violations of rule X"           | The agent's plan per file, your confirmation, the fix, and a rescan                   |
| **Traceability**      | "Show the traceability matrix"           | Requirement → feature → file → test → PR, with gaps, ready to paste in an audit       |
| **Several repos**     | "How are our repos doing?"               | Per repository: findings, trend, audit level, spec compliance                         |
| **Review in CI**      | (a workflow in the reviewed repo)        | A pending review drafted on every ready PR, for you to submit                         |

What it is **not**:

- **Not an approver.** The model can only leave a _pending_ review that you edit and submit. You stay the
  reviewer of record.
- **Not a test runner or linter.** It reads the diff and code; it does not build or execute anything.
  Style that linters enforce is deliberately not reported.
- **Not a security audit.** It flags security-sensitive code it sees in the diff; it is no substitute for
  a dedicated scan.

---

## 2. When to use it

| Moment                                                                          | Who       | Play                                                                 |
| ------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| You are assigned a PR to review                                                 | Reviewer  | [Review a PR](#play-a--review-a-pr)                                  |
| The PR implements a ticket with acceptance criteria                             | Reviewer  | [Review against the ticket](#play-b--review-against-the-ticket)      |
| You opened a PR (draft is fine) and want a second look before asking for review | Author    | [Self-review your PR](#play-c--self-review-before-asking-for-review) |
| New commits were pushed after your review                                       | Reviewer  | [Re-review](#play-d--re-review-after-new-pushes)                     |
| A repo has no architecture rules yet                                            | Tech lead | [Bootstrap rules](#play-e--bootstrap-architecture-rules)             |
| Before a release, after a refactor, or every sprint                             | Tech lead | [Spec drift check](#play-f--spec-drift-check)                        |
| Monthly, or when people complain about noisy comments                           | Tech lead | [Tune the reviewer](#play-g--tune-the-reviewer-with-metrics)         |
| An audit or a client asks how requirements are covered                          | Tech lead | [Traceability matrix](#play-h--traceability-matrix)                  |
| A rule keeps drifting and you want it fixed                                     | Tech lead | [Origin and fix](#play-i--find-the-origin-and-fix-a-rule)            |
| You want a draft review on every PR without asking                              | Tech lead | [Review in CI](#play-j--review-in-ci)                                |
| You look after several repositories                                             | Tech lead | [Several repos](#play-k--several-repositories)                       |

**Skip it** for trivial PRs (typos, version bumps, generated files, lockfile-only changes): most of their
files are filtered out anyway, so you'd pay for little. **Split it** when a PR is very large (dozens of
groups): review it in two sittings or ask the author to split the PR; the review still works, it just takes
longer.

---

## 3. Where to set it up

### Which client

| Client             | Dashboards | Best for                                                                        |
| ------------------ | ---------- | ------------------------------------------------------------------------------- |
| **Cursor**         | yes        | Day-to-day reviews inside the project you work on (recommended)                 |
| **Claude Desktop** | yes        | Reviews outside an editor                                                       |
| **Claude Code**    | no (text)  | Terminal workflows and subagents (parallel groups); edit `comments.md` directly |

### Where the config goes

| Scope                         | File                                                         | Use when                                                                                |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **One project** (recommended) | `<project>/.cursor/mcp.json`                                 | You review PRs of the repo you have open. `${workspaceFolder}` points the server at it. |
| All projects                  | `~/.cursor/mcp.json`                                         | You review several repos; pass `repoPath` or set `PR_REVIEW_REPO`                       |
| Claude Code, one project      | `claude mcp add …` (stored in `~/.claude.json`)              | Same as above, from the terminal                                                        |
| Claude Code, shared           | `claude mcp add --scope project …` → `.mcp.json` in the repo | Teammates have this server at the same path                                             |

Project config for Cursor (copy it, then fix the server path):

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

Don't register the server twice (global **and** project) under the same name: you'd get two copies of every
tool, possibly pointing at different repos.

### Where things end up

| What                           | Where                                                                                                              | Commit it?                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Architecture / standards rules | `<repo>/.semgrep/<set>/<pack>.yml`                                                                                 | **Yes** — they are the spec                                              |
| Review artifacts               | `<repo>/.pr-review/pr-<N>/` if that folder exists or is gitignored, else `~/.local/state/pr-review/<repo>/pr-<N>/` | No — add `.pr-review/` to `.gitignore` if you want them next to the code |
| Review metrics                 | `~/.local/state/pr-review/metrics.jsonl`                                                                           | No                                                                       |
| Baseline and history           | `<repo>/.semgrep/baseline.json`, `<repo>/.semgrep/history/<date>.json`                                             | **Yes** — written by `spec-drift baseline --write` / `record`            |
| The review itself              | GitHub, as a **pending** review until you submit it                                                                | —                                                                        |

### One-time checklist

- [ ] `nvm install && pnpm install && pnpm build` in `spec-drift`
- [ ] `gh auth status` is logged in, and `GITHUB_TOKEN` / `GH_TOKEN` are not set to a stale token
- [ ] `semgrep --version` works
- [ ] The client config is in place (above); in Cursor, **Settings → MCP** shows `spec-drift` enabled
- [ ] The Jira / Linear MCP is connected too (e.g. Atlassian), if you want ticket checks from a key
- [ ] Use **Agent** mode in Cursor's chat

---

## 4. Plays

### Play A — Review a PR

1. **Ask.** In the project's chat:

   ```
   /review-pr pr: 828
   ```

   or in plain words: _"Review PR 828 with spec-drift."_ Add a focus if you have one:
   `/review-pr pr: 828 focus: "notifications API"`.
2. **Let the loop run.** The agent calls `pr_review_start`, then for each group `pr_review_next_group` →
   `pr_review_submit_findings`, then verifies its findings. There is no UI during the loop; you'll see the
   tool calls. With subagents (Claude Code), groups run in parallel.
   - If it asks about a **possible ticket** (`MLC-123` in the title, `Closes #45`), say yes and go to Play B.
3. **Open the dashboard.** When coverage is complete, the agent calls `pr_review_status` and the PR Review
   dashboard opens:
   - **Comments** — each inline comment and the summary, editable (word limits shown).
   - **Requirements** — only with a ticket: a verdict per criterion, which you can change.
   - **Coverage** — every group, the verification and ticket steps, and each finding's verdict.
   - **Architecture** — the repo's rule findings on the PR files: **Add selected to comments** / **Add all**.
   - **Report** — the full analysis the agent wrote (Formatted / Markdown); not posted to GitHub.
4. **Edit.** Rewrite what's unclear and **Save draft**. To drop a comment or add one, tell the agent
   (_"remove the comment on src/orders/service.ts:88"_): it rewrites the draft and the dashboard reloads.
   "Worth a look" items in the summary are unconfirmed: keep them only if you agree.
5. **Decide and publish.** Pick **Approve**, **Request changes** or **Comment**, then either
   **Submit review…** (it shows what changed and asks you to confirm) or **Save as pending on GitHub** to
   finish on GitHub. Asking the agent to publish also only creates a _pending_ review.

**Done when** the review is submitted on GitHub. Then optionally clean up: _"Clean up the review of PR 828"_
(`pr_review_cleanup`).

### Play B — Review against the ticket

Use it when the PR implements a ticket with acceptance criteria or a definition of done.

| Ticket in       | Ask                                                    | What happens                                                        |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Jira / Linear   | `/review-pr pr: 828 ticket: MLC-123`                   | The agent reads it with its Jira / Linear tools and passes the text |
| GitHub issue    | `/review-pr pr: 828 ticket: #45`                       | The server fetches it with `gh`                                     |
| Anywhere else   | `/review-pr pr: 828 ticket: "<paste the ticket text>"` | The pasted text is parsed                                           |
| Already started | _"Check it against MLC-123"_                           | `pr_review_set_ticket` adds it to the running review                |

After the groups, the agent gives each criterion a verdict — **met**, **partial**, **unmet** or
**unverifiable** (the diff can't prove it: runtime behaviour, UX, deployment) — with `path:line` evidence,
and lists changes no criterion explains. In the dashboard's **Requirements** tab you can correct any verdict;
the summary checklist updates. An unmet criterion suggests _Request changes_; the decision is yours.

**Tip:** if the ticket has no recognizable "Acceptance criteria" / "Criterios de aceptación" / "Definition of
done" section, ask the agent to list the criteria explicitly when it attaches the ticket.

### Play C — Self-review before asking for review

As the author, open the PR (a draft PR is fine), then run Play A on it. Read the dashboard, fix what's real
in your branch, push, and **don't publish** — the draft stays local. Re-run after the push (Play D) to check
nothing is left.

### Play D — Re-review after new pushes

Ask again: _"Review PR 828 again."_ The previous review is kept as `report.v1.md` / `comments.v1.md`, and the
agent gets the list of files changed since the last reviewed commit plus your previous comments, so it checks
whether each was addressed instead of starting blind. A ticket attached before is kept (its verdicts start
over).

### Play E — Bootstrap architecture rules

When the PR dashboard's **Architecture** tab says the repo has no `.semgrep/` rules:

1. Click **Ask the agent to write rules** (or ask _"Write architecture rules for this repo"_). The agent
   studies the codebase (ADRs, `AGENTS.md`, module boundaries) and writes rule packs under `.semgrep/` (e.g.
   `architecture/` and `standards/`).
2. Click **Rescan** to run them on the PR.
3. Review the rules like code and commit them: from then on every PR review and spec-drift scan uses them.

Each rule should state the ADR or doc it enforces in its message or metadata, so drift reports can group by
it.

### Play F — Spec drift check

Run before a release, after a big refactor, or once per sprint:

```
/spec-drift-report
/spec-drift-report paths: "packages/domains/shared" severity: ERROR
```

or _"Which architecture rules are drifting under packages/domains/shared? Only errors."_ The analysis
dashboard opens with violations grouped by rule and ADR; the agent summarizes the worst ones with a fix per
rule. Turn the findings into tickets — or, when a rule no longer reflects a decision, update the ADR and the
rule together.

The scan runs on `ANALYSIS_REPO_ROOT` (the open project with the recommended config). Use
_"List the rule packs"_ (`list_rule_packs`) to see what will run.

### Play G — Tune the reviewer with metrics

Every published review records how many drafted comments you kept, edited or removed. After a few weeks:

```
Show the PR review metrics.
```

`pr_review_metrics` reports the rates overall, by severity and by checklist item (e.g.
`ts_js_tsx_jsx.dead-code`), and names the **noisiest items** (the ones whose comments get removed most).
Act on them in the repo's **review profile**, `.pr-review.yml` at the repo root (merge it to the base
branch: the review reads it from there, never from the PR):

```yaml
summaryOnly: [ts_js_tsx_jsx.dead-code] # still reported, but only in the summary
disable: [python.performance] # not checked at all
severity: { go.errors-panics-and-api-contracts: high }
reviewTests: true # test files get the tests checklist
addedLinesOnly: false # true: comment only on lines the PR added
```

Then **check the change offline** before trusting it: `pnpm eval prepare`, run the reviewer on the
cases, `pnpm eval score results.json` ([eval/README.md](../eval/README.md)). Precision should not drop
when you chase recall. Add a case whenever a real defect slipped through or a comment was pure noise.
A rising "kept" rate on real reviews is the signal the reviewer is getting better. The same report gives the median
minutes, tool calls, and tool output (an estimate in tokens) per review: what a review costs.

### Play H — Traceability matrix

_"Show the traceability matrix"_ (or only one slice, or only the gaps). `traceability_matrix` reads the kit's knowledge
index — run `asdd knowledge sync` first when specs changed — and lists each requirement with its features, the files
they own, the tests among them, and the PRs that touched them. Gaps: no feature, no test, not passing. **Copy as
Markdown** in the dashboard puts the table in an audit document.

### Play I — Find the origin and fix a rule

On a finding: _"Where did src/domain/order.ts line 12 come from?"_ — `drift_origin` answers with the commit that last
changed the line and the one that first added it, each with author, date and PR. To clean up a rule, press **Ask the
agent to fix** on it in the Drift tab (or `/fix-rule-violations rule_id: …`): the agent lists its plan per file and
waits for your confirmation, fixes the cause (it never silences the rule), and rescans what it changed. Freeze what you
accept with a baseline (`spec-drift baseline --write`) and record a snapshot each sprint (`spec-drift record`) to follow
the trend.

### Play J — Review in CI

`node bin/spec-drift.mjs ci-review --kit-ref <commit>` prints a GitHub Actions workflow; commit it as
`.github/workflows/spec-drift-review.yml` in the reviewed repository with two secrets, `ANTHROPIC_API_KEY` and
`SPEC_DRIFT_REVIEWER_TOKEN` (a fine-grained token of the person who submits reviews). On every ready PR it drafts a
**pending** review that belongs to that person: open the PR, read it, edit or drop comments, and submit. Drafts and fork
PRs are skipped.

### Play K — Several repositories

Set `SPEC_DRIFT_REPOS` to the repositories' paths in the client config and ask _"How are our repos doing?"_.
`repos_overview` reads each one's latest snapshot and audit report (no scan): findings, new ones, the trend, the audit
level and spec compliance. A repository without data says which command to run there.

---

## 5. Working well with it

- **One PR per conversation.** Each review loads its own context; start a new chat for the next PR.
- **Let it finish the loop** before asking questions: publishing is blocked until every group, the
  verification and the ticket step are done.
- **Large PRs:** clients with subagents (Claude Code) review groups in parallel; the prompt suggests running
  the group subagents on a faster model and keeping verification on the strongest one.
- **Read "Not reviewed" in the summary.** Files too large to review or secrets files are listed there,
  and they keep the suggested decision from being Approve: check them by hand.
- **Code scanning (optional).** Each draft writes `findings.sarif`; upload it to see the findings as
  code-scanning alerts that follow the code across commits (command in the README).
- **Ask it to read more, not to guess.** If a comment lacks evidence, ask _"Show me the caller"_: the agent
  reads the PR's code with `pr_review_read_file` / `pr_review_search`, never your local checkout (which may
  be on another branch).
- **Treat PR content as untrusted.** The diff, its comments and the ticket are passed to the model as data;
  the model cannot submit a visible review even if a PR tries to make it.
- **Rebuild after updating this server** (`pnpm build`) and restart it in the client, or you'll see the old
  dashboard.

---

## 6. Quick reference

| I want to…                 | Say / run                                    |
| -------------------------- | -------------------------------------------- |
| Review a PR                | `/review-pr pr: 828`                         |
| … against a ticket         | `/review-pr pr: 828 ticket: MLC-123`         |
| … focusing on an area      | `/review-pr pr: 828 focus: "payments"`       |
| Re-review after pushes     | "Review PR 828 again"                        |
| Reopen the dashboard       | "Show the status of the PR 828 review"       |
| Publish (pending)          | "Publish the review" — then submit on GitHub |
| Submit directly            | **Submit review…** in the dashboard          |
| Remove local artifacts     | "Clean up the review of PR 828"              |
| Check spec drift           | `/spec-drift-report`                         |
| See which rule packs exist | "List the rule packs"                        |
| Review quality and cost    | "Show the PR review metrics"                 |
| Traceability               | "Show the traceability matrix"               |
| Where a finding came from  | "Where did `<file>` line `<n>` come from?"   |
| Fix a rule's violations    | `/fix-rule-violations rule_id: <id>`         |
| A long scan                | "Start the analysis in the background"       |
| Several repositories       | "How are our repos doing?"                   |
| Review in CI               | `spec-drift ci-review --kit-ref <commit>`    |

In Claude Code, the slash commands are `/mcp__spec-drift__review-pr` and
`/mcp__spec-drift__spec-drift-report`.

Something not working? See [Troubleshooting](../README.md#troubleshooting).
