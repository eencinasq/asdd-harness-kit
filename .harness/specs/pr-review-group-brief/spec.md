# pr-review-group-brief — Spec (hotfix)

## Intent

The spec-drift e2e test "each group brings its own diff; parallel reviewers can take groups by index" fails since
78d1fb9: that commit first tracked `src/pr-review/coverage/coverage.ts` (previously hidden by the `coverage/`
ignore rule), and the tracked version's group instruction lost two parts the test pins: the pointer to read other
code at the PR version (`pr_review_read_file` / `pr_review_search`, not the local checkout) and the commentable
lines as one line of ranges. Restore both in `nextGroupBrief`.

Mapped: `tools/spec-drift/src/pr-review/coverage/coverage.ts`

## Requirements

- **REQ-001.** Each group instruction shall tell the reviewer to read other code with `pr_review_read_file` / `pr_review_search` (the PR version).
- **REQ-002.** Each group instruction shall state the commentable lines as `Comment only on these lines (RIGHT side): <path> <ranges>[; <path> <ranges>].`
