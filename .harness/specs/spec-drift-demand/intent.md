# Intent: spec-drift-demand

## Source

- **Pitch ID:** ad-hoc — `tools/spec-drift/docs/ROADMAP.md` priority **P4** except P4.5 (P4.1 drift origin, P4.2 guided
  fix, P4.3 review cost and time, P4.4 CI mode, P4.6 CodeQL adapter, P4.7 multi-repo view)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-14: "start with P4, except P4.5 in another slice"; GitLab / Azure
  DevOps stays out)

## Problem

A finding says what is wrong but not who introduced it or in which PR. Fixing a rule's violations is a manual hunt. Nobody
knows what a review costs in time or calls. Reviews start only when someone asks in chat. Semgrep is the only engine. A
Tech Lead with several repositories reads each one separately.

## Desired Outcome

A finding's origin (commit, author, date, PR) is one call away; the agent can be asked to fix a rule's violations and
rescan; each published review records its time and calls; a CI workflow drafts a pending review that a human still
submits; CodeQL can replace Semgrep as the engine; one view summarizes several repositories.

## Must-have outcomes

- MH-01 Drift origin: `drift_origin` for a path and line (blame, the commit's PR, when the line text first appeared).
- MH-02 Guided fix: a `fix-rule-violations` prompt and a dashboard action per drifting rule; the agent edits in the host.
- MH-03 Review cost: minutes, tool calls, and returned text size per review in `metrics.jsonl` and `pr_review_metrics`.
- MH-04 CI mode: `spec-drift ci-review` prints a GitHub Actions workflow that runs the review with Claude Code and leaves a
  pending review under a reviewer's token.
- MH-05 CodeQL: a `CodeqlAnalyzer` behind the port, selected with `SPEC_DRIFT_ENGINE=codeql`.
- MH-06 Multi-repo: `repos_overview` over `SPEC_DRIFT_REPOS`.

## Mapped files

`tools/spec-drift/src/**`, `tools/spec-drift/ui/**`, `tools/spec-drift/test/**`, `tools/spec-drift/bin/**`,
`tools/spec-drift/README.md`, `tools/spec-drift/docs/**`

## No-gos

The MCP server writes no repository file and publishes no visible review; the CI workflow is printed, not written; no
package publishing; no GitLab / Azure DevOps (P4.5).
