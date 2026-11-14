# Design: review-quality

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `tools/spec-drift/src/pr-review/metrics/eval-score.ts` | Case fields `language`, `category`, `noise`; breakdowns; `compareWithBaseline`; repeated-noise count (REQ-002, 004) |
| `tools/spec-drift/src/pr-review/metrics/eval-cases.ts` (new) | `validateCase` (REQ-001) and `caseFromReview` (REQ-004), pure |
| `tools/spec-drift/src/pr-review/metrics/eval-cases.spec.ts` (new) | Validates every repo case + set size (AC-001, AC-003); harvest unit test (AC-004) |
| `tools/spec-drift/scripts/eval.mts` | `score --json --baseline --max-drop`, `check`, `harvest` |
| `tools/spec-drift/eval/cases/*.json` | ≥ 30 synthetic cases (REQ-003) |
| `cli/src/harness/learning-lib.mjs`, `learn.mjs` (+ test, vendored copies) | `ingestReviewMetrics`, review signals, `review_quality` in `learningReport` (REQ-005) |
| `tools/spec-drift/src/audit/audit-insight.output.ts`, `ui/audit-dashboard/**` | `review_quality` in the learning view |
| `cli/steering/quality-gates.md`, docs | QG-LEARN-01 lists removed review comments; eval README; spec-drift README |

## Domain Placement
- Owning domain: review quality (spec-drift PR review) and the harness learning loop; no product code.
- Integration boundaries: the server writes `metrics.jsonl` in the review root (unchanged); the kit CLI reads it.
- Documented exceptions: none.

## Domain Impact
Terms in capability.md (evaluation case, known noise, baseline, review signal). No product domain change.

## Decisions
- **ADR-001 — The CLI ingests, the server stays read-only.** `asdd learn` reads the local `metrics.jsonl` and writes the
  author's weekly summary (one writer per file, committed), like every other signal. Rejected: the server writing
  `.harness/state/learning` (breaks the read-only invariant and the one-writer rule).
- **ADR-002 — Client code never enters the kit repo.** Harvested cases default to `$PR_REVIEW_ROOT/eval-cases/`;
  `pnpm eval score` takes any cases directory, so a team keeps a private set beside the public synthetic one.
- **ADR-003 — CI validates, sessions measure.** CI runs `validateCase` (deterministic). Scoring needs a model's output,
  so the baseline gate is an exit code of `pnpm eval score`, run where the model runs.
- **ADR-004 — Noise, not precision, is the learning signal.** A removed comment is a direct noise event per rule;
  kept/edited feed the `review_quality` totals. Signature `review:<ruleId>`; a pattern opens at 3 occurrences
  (QG-LEARN-02), kind `noise`, so the next step is loosening the rule (`.pr-review.yml` disable / summaryOnly / severity,
  or the rule doc).
- **ADR-005 — Labels by substring when authoring.** Synthetic cases are generated from before/after sources with labels
  found by a unique substring of the defect line, then validated (REQ-001); the committed artifact is the JSON case.

## Risks
- Synthetic cases measure the reviewer on authored defects, not the team's code: harvesting real reviews (REQ-004)
  is the path to representative cases.
- Folder-name project matching (VAL-002).

Design confidence 0.86.
