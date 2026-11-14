# Design: spec-drift-demand

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `src/analysis/domain/drift-origin.ts` (new), `analysis.service.ts`, `analysis.tools.ts`, `analysis.output.ts`, `analysis.schemas.ts` | `drift_origin`: `git blame --porcelain`, `git log -S` (pure parsing + service) |
| `src/analysis/domain/fix-prompt.ts` (new), `analysis.prompts.ts`, `ui/analysis-dashboard/**` | `fix-rule-violations` prompt; **Ask the agent to fix** per drifting rule |
| `src/pr-review/metrics/review-cost.ts` (new), `review-metrics.ts`, `pr-review.service.ts`, `pr-review.tools.ts`, artifacts | Call log per review; cost in metrics; medians |
| `src/cli/ci-review.ts` (new), `src/cli/cli.ts`, `bin/spec-drift.mjs`, `src/common/process/process-runner.service.ts` | `spec-drift ci-review`; `GH_TOKEN` kept with `CI=true` |
| `src/analysis/engines/codeql/**` (new), `src/app.module.ts`, `src/config/env.schema.ts` | CodeQL adapter; `SPEC_DRIFT_ENGINE` |
| `src/analysis/domain/repos-overview.ts` (new), `analysis.service.ts`, `analysis.tools.ts`, `env.schema.ts` | `repos_overview` over `SPEC_DRIFT_REPOS` |
| `README.md`, `docs/ROADMAP.md` | The six features; P4 status |

## Domain Placement
- Owning domain: spec-drift analysis, PR review, CLI.
- Integration boundaries: git history; `.semgrep/history/`, `.harness/audits/` of other repositories; CodeQL CLI; GitHub
  Actions.
- Documented exceptions: none.

## Domain Impact
Terms in capability.md. No product domain change.

## Decisions
- **ADR-001 — Origin from git only.** `git blame -L n,n --porcelain` gives the last change; `git log -S<line text>
  --reverse` the first commit that added the text. PR numbers from the subject, as in the traceability matrix.
- **ADR-002 — Fix is a prompt.** The server lists violations and steps; the agent edits after the user confirms; the
  rescan is a normal analyze call with `paths`.
- **ADR-003 — Cost from the server's view.** A per-review call log (tool name, characters returned) is appended by the
  tools; minutes are `published_at − started_at`. Tokens are estimated (chars / 4) and labelled as an estimate.
- **ADR-004 — Reviewer token in CI.** The workflow exports `GH_TOKEN: ${{ secrets.SPEC_DRIFT_REVIEWER_TOKEN }}` (a
  reviewer's fine-grained token), so the pending review is the reviewer's to submit. The process runner drops
  `GH_TOKEN`/`GITHUB_TOKEN` only outside CI (a stale GUI token breaks `gh` locally).
- **ADR-005 — Engine by environment.** `SPEC_DRIFT_ENGINE=semgrep|codeql` chooses the engine module in `app.module.ts`;
  the dependency-graph rules join either engine through the composite.
- **ADR-006 — Overview reads files.** `repos_overview` reads each repository's latest snapshot and audit report; it runs
  no scan.

## Risks
- CodeQL output mapping is tested against SARIF samples, not a live CodeQL run.
- `git log -S` is slow on very large histories; it is limited to the line's file.

Design confidence 0.8.
