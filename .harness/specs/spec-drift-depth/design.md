# Design: spec-drift-depth

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `src/audit/domain/traceability.ts` (new) | Rows, test detection, PR numbers, gaps, totals, Markdown (pure) |
| `src/audit/audit.service.ts`, `audit-insight.tools.ts`, `audit.output.ts` | `traceability_matrix` over the knowledge store and one `git log` pass |
| `ui/audit-dashboard/**` | Traceability tab |
| `src/pr-review/risk/file-risk.ts` (new) | Score, level, reasons, ranking (pure) |
| `src/pr-review/pr-review.service.ts`, `github/github.service.ts`, `prompt/review-prompt.ts`, types, schemas, `ui/pr-review/**` | Risk at start (saved with the review artifacts), "Read first" in the prompt, status and dashboard |
| `src/analysis/engines/dependencies/**` (new) | Layer table parser, import extraction/resolution, graph checks, `DependencyAnalyzer` |
| `src/analysis/engines/composite.analyzer.ts` (new), `semgrep-engine.module.ts`, `domain/pack-selection.ts` | Semgrep + dependencies behind `CODE_ANALYZER`; architecture mode includes the `dependencies` set |
| `cli/templates/bindings/domain-layer.project.md` | Optional `Dependency layers` table |
| `src/analysis/jobs/analysis-jobs.ts` (new), `analysis.tools.ts`, `analysis.schemas.ts`, `analysis.output.ts`, `analysis.module.ts` | `analysis_start` and `analysis_job` (two tools: the `analyze_*` tools declare a scan-summary output schema, so they cannot return a job) |
| `src/common/mcp/elicitation.ts` (new), `pr-review.tools.ts`, `pr-review.service.ts` | Confirm publish; ask for the ticket |
| `README.md`, `docs/ROADMAP.md` | Tools, the table, background jobs, elicitation; P3 marked done |

## Domain Placement
- Owning domain: spec-drift audit (traceability), PR review (risk), analysis engines (dependency graph).
- Integration boundaries: knowledge index `.harness/knowledge/`, features `.harness/features/`, audit reports
  `.harness/audits/`, git history; the binding `.harness/steering/domain-layer.project.md`.
- Documented exceptions: none.

## Domain Impact
Terms in capability.md. No product domain change.

## Decisions
- **ADR-001 — PRs from commit subjects.** GitHub squash and merge commits carry `(#N)` or `Merge pull request #N`; one
  `git log --name-only` pass (latest 5 000 commits) maps files to PR numbers without network calls.
- **ADR-002 — Test files by path.** `test/`, `tests/`, `__tests__/`, `spec/` folders, `*.test.*`, `*.spec.*`,
  `*.e2e-spec.*`, `*_test.go`, `test_*.py`, `*_test.py`, `*Test.java`, `*Test.kt`. A requirement whose features own no
  such file has the gap `no-test`, even if a verification command exists (the matrix shows the commands too).
- **ADR-003 — Composite analyzer.** `CODE_ANALYZER` stays one port. `CompositeAnalyzer` lists Semgrep's packs plus the
  `dependencies` set, routes each pack to its engine, merges findings; engine info, rule tests, and authoring guide
  stay Semgrep's, with one guide line for the table. A PR scan (`targetRoot` snapshot) checks layers of the given files
  only; cycles need the whole graph and are skipped there.
- **ADR-004 — No MCP Tasks.** Protocol 2026-07-28 removed `tasks/*`; a background job is an `analysis_job` poll, held in
  memory (stdio and HTTP processes are long-lived). Elicitation uses `inputRequired` on 2026-07-28 requests (stateless:
  the client retries the call with the answers); 2025-era requests keep today's behavior, because the server serves
  them statelessly and cannot push a request.
- **ADR-005 — Risk is advisory.** Group order and coverage rules do not change; the ranking only says where to start.
- **ADR-006 — Imports by regex.** No parser dependency: line-based extraction per language, resolution against the
  tracked file set (extensions and `index` files for JS/TS, packages for Python, `go.mod` module prefix for Go, package
  folders for Java/Kotlin). Unresolved imports (packages) are ignored. TypeScript `import type` / `export type` count for layers but not
  for cycles (erased at runtime); found when the engine ran on spec-drift's own code.

## Risks
- Regex import extraction misses unusual syntax (multi-line Python imports in parentheses are handled; dynamic imports
  with expressions are not).
- File-level cycles through barrel `index` files can be many; the baseline absorbs existing ones.

Design confidence 0.8.
