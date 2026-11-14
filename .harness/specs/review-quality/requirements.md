# Requirements: review-quality

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — Cases are checked (P1)
**Universal:** The unit suite shall validate every case under `tools/spec-drift/eval/cases`: the id matches the file
name, the diff parses into at least one reviewable file, every labelled defect lies on an added line of its file in the
diff, every cited `ruleId` is a checklist item of the rule docs, and `language` and `category` are set.

### REQ-002 — Scores compare with a baseline (P1)
**Event-driven:** When `pnpm eval score` runs, it shall report precision, recall, and F1 overall and per language and
category; with `--json <file>` it shall write the summary; and with `--baseline <file>` it shall exit non-zero when
precision or recall drops by more than `--max-drop` points (default 5) against that baseline.

### REQ-003 — An evaluation set (P1)
**Universal:** The repository shall hold at least 30 synthetic cases covering at least 6 languages, at least one third of
them clean (`expected: []`).

### REQ-004 — Cases from real reviews (P2)
**Event-driven:** When `pnpm eval harvest <review dir>` runs on a published review, it shall write a case whose diff is
the review's diff, whose expected defects are the published comments, and whose `noise` lists the draft comments the
human removed; by default it shall write outside the repository (`$PR_REVIEW_ROOT/eval-cases/`), and scoring shall count
a finding on known noise as a repeated false positive.

### REQ-005 — Review noise reaches the learning loop (P1)
**Event-driven:** When `asdd learn` runs, it shall read the reviewer's local publish metrics for this project (the review
root's `metrics.jsonl`), record each review once (counts per checklist rule, no comment text) in the author's weekly
summary, and derive a `review:<rule>` noise signal for each rule with removed comments; `learning_report` shall show team
review quality (drafted, kept, edited, removed, per-rule removal) from all summaries.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | `eval-cases.spec.ts` passes on the repo cases and fails a case with a label on a context line or an unknown rule (unit). |
| AC-002 | REQ-002 | Pure tests: per-language/category breakdown; `compareWithBaseline` flags a 6-point precision drop and passes a 4-point one. |
| AC-003 | REQ-003 | The case spec counts ≥ 30 cases, ≥ 6 languages, ≥ 1/3 clean. |
| AC-004 | REQ-004 | Pure test: a review with one kept, one edited, one removed draft comment → 2 expected defects and 1 noise label; default output dir is under the review root. |
| AC-005 | REQ-005 | `learning-lib.test.mjs`: ingesting a metrics file twice records each review once, only this project's; a rule with removed comments on 3 reviews opens a `noise` pattern; `learningReport` returns `review_quality`; no comment text in the summary. |
