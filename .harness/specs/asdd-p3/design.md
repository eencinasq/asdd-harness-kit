# asdd-p3 — Design (lite)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/waves-lib.mjs` | Pure wave/parallelism planner |
| `cli/src/harness/waves-lib.test.mjs` | Fixtures |
| `cli/src/harness/waves.mjs` | CLI entry |
| `cli/src/harness/portfolio-lib.mjs` | Read-only multi-repo summary |
| `cli/src/harness/portfolio-lib.test.mjs` | Fixtures |
| `cli/src/harness/portfolio.mjs` | CLI entry |
| `cli/src/harness/converge-eval-lib.mjs` | Deterministic EARS/case scorer |
| `cli/src/harness/converge-eval-lib.test.mjs` | Unit tests |
| `cli/src/harness/converge-eval.mjs` | CLI entry |
| `cli/eval/converge-ears/cases/*.json` | Eval fixtures |
| `cli/src/harness/commands.mjs` | Register `waves`, `portfolio`, `converge-eval` |
| `cli/README.md` | Help |
| `docs/ASDD-ROADMAP.md` | P3 status; P3.3/P3.4 deferred |
| `package.json` | Tests |

## Domain terms

- **wave** — topological layer of features that can start once deps are `passing`
- **portfolio** — read-only list of sibling harness repos
- **converge-eval** — fixture batch that locks cheap + EARS-shaped converge judgments

## ADRs

- **ADR (local):** P3.5 is deterministic (fixture + structural/EARS heuristics), not LLM-judged — same spirit as Spec Drift review-quality eval scoring without calling a model in CI.
- **ADR (local):** P3.3 / P3.4 stay out of this slice; ROADMAP marks them for a later kit version.
