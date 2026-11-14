# Design: rule-coverage

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `src/analysis/domain/adr-coverage.ts` (new) | ADR discovery and parsing, coverage, dangling references, the rule prompt per ADR (pure + one fs reader) |
| `src/analysis/domain/rule-readiness.ts` (new) | Per-rule readiness from test results and hits (pure) |
| `src/analysis/ports/code-analyzer.port.ts`, `engines/semgrep/semgrep.analyzer.ts` | Optional `testRules(repoRoot)` (Semgrep: `semgrep --test --json`); authoring guide requires tests |
| `src/analysis/analysis.{service,tools,prompts,output,types,presenter}.ts` | `adr_coverage`, `validate_rules`, prompt `write-adr-rule`; `adrCoverage` and `ruleTests` in the scan summary; `.semgrep` excluded |
| `src/pr-review/architecture/architecture-scan.service.ts` | Exclude `.semgrep` |
| `ui/analysis-dashboard/**`, `ui/analysis-dashboard.html` | ADR coverage tab with ask action; test badge per rule |
| `cli/src/harness/semgrep-lib.mjs` (+ test, vendored copy), `cli/steering/spec-drift.md` | Exclude `.semgrep` from the kit's scan; document |

## Domain Placement
- Owning domain: spec-drift analysis (engine-neutral domain + Semgrep adapter); kit architecture check.
- Integration boundaries: ADR files and rule metadata are read from `ANALYSIS_REPO_ROOT`; nothing is written.
- Documented exceptions: none.

## Domain Impact
Terms in capability.md (ADR, ADR coverage, dangling reference, rule test, rule readiness). No product domain change.

## Decisions
- **ADR-001 — Coverage reads ADR files, not slice designs.** The kit's convention is one file per ADR with global
  numbering; inline per-slice ADRs (`ADR-001` in every slice) are not globally identifiable.
- **ADR-002 — Ids match by number.** `ADR-10`, `ADR-0010`, and a file `0010-x.md` are the same decision; a rule's
  `metadata.adr` may list several (string or list).
- **ADR-003 — Exempt by marker.** Some decisions cannot be checked by code rules (hosting, process); an ADR line
  `Enforcement: manual` (or `none`) removes it from the denominator instead of lowering coverage forever.
- **ADR-004 — Noisy = ≥ 50 hits or ≥ 20 files.** Fixed, returned with the result, so a reader can judge; readiness =
  valid ∧ test passed ∧ ¬noisy. No hits is not a flag (a preventive rule may never fire).
- **ADR-005 — Tests through an optional port method.** `testRules` is optional on `CodeAnalyzer`; an engine without it
  reports tests `unavailable`, never passing.
- **ADR-006 — Coverage in every scan summary.** It costs a directory read, so the dashboard always has it; the
  standalone tool serves text-only hosts.

- **ADR-007 — Exclude and filter.** Semgrep applies `--exclude` to walked folders but not to explicit targets (checked
  with Semgrep 1.183: `--exclude .semgrep -- .semgrep/x.ts` still reports `.semgrep/x.ts`). Every scan passes
  `--exclude .semgrep` **and** drops explicit paths under `.semgrep/` (PR files, audit changed files, analysis paths).

## Risks
- ADR formats vary (MADR, adr-tools, Nygard); unrecognized files are listed without an id and reported, not dropped.

Design confidence 0.85.
