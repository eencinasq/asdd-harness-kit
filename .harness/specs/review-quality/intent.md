# Intent: review-quality

## Source

- **Pitch ID:** ad-hoc — `tools/spec-drift/docs/ROADMAP.md` priority **P0** (P0.1 evaluation set, P0.2 shared metrics)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-12: "empecemos con la prioridad … P0: evaluación + métricas")

## Problem

The PR reviewer's quality cannot be measured: `eval/cases` holds 3 synthetic cases, nothing checks that a case is
well-formed, and a score cannot be compared with a previous run. Real reviews leave everything needed to build cases
(diff, the agent's draft, what the human published) but no tool turns them into cases. The publish metrics (kept /
edited / removed per checklist rule) stay in each reviewer's `~/.local/state/pr-review/metrics.jsonl`: the Tech Lead and
the harness learning loop never see which rules are noisy. Real data today: 11 published reviews, 6 drafted comments, all
kept — precision is visible, recall is unknown.

## Desired Outcome

A labelled evaluation set (≥ 30 cases, ≥ 1/3 clean, several languages) validated on every `pnpm test`; scores broken
down by language and category and compared with a saved baseline; real reviews turned into private cases; and review
noise flowing into the harness learning loop through the existing committed weekly summaries, visible in
`learning_report`.

## Must-have outcomes

- MH-01 Case validation in the unit suite (diff parses; each label is on an added line of its file; cited rules exist).
- MH-02 Score by language and category; `--json` output; `--baseline` comparison that fails on a precision or recall drop.
- MH-03 ≥ 30 synthetic cases in the repo, ≥ 1/3 clean, ≥ 6 languages.
- MH-04 `pnpm eval harvest`: a published review → a case (published comments = defects, removed draft comments = known noise), written outside the repository by default.
- MH-05 `asdd learn` ingests the reviewer's local publish metrics for this project into the author's weekly summary; removed comments become `review:<rule>` noise signals; `learning_report` shows team review quality.

## Mapped files

`tools/spec-drift/eval/**`, `tools/spec-drift/scripts/eval.mts`, `tools/spec-drift/src/pr-review/metrics/**`,
`tools/spec-drift/src/audit/audit-insight.output.ts`, `tools/spec-drift/src/audit/audit.service.ts`,
`tools/spec-drift/test/insight.e2e-spec.ts`, `tools/spec-drift/ui/audit-dashboard/**`,
`tools/spec-drift/README.md`, `tools/spec-drift/docs/**`, `tools/spec-drift/src/harness/learning-lib.mjs`,
`tools/jev-gate/src/harness/learning-lib.mjs`, `tools/knowledge/src/harness/learning-lib.mjs`,
`cli/src/harness/learning-lib.mjs`, `cli/src/harness/learning-lib.test.mjs`, `cli/src/harness/learn.mjs`,
`cli/steering/quality-gates.md`, `.harness/steering/quality-gates.md`

## No-gos

Client code (real diffs) committed to the kit repository; the MCP server writing to the reviewed repository or to
`.harness/`; running a model in CI; comment text in committed learning files (counts and rule ids only).
