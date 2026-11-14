# review-quality — Tasks

| Task | Requirements | Scope | Depends on |
|------|--------------|-------|------------|
| TASK-001 Case validation, breakdowns, baseline comparison, harvest (pure + script) | REQ-001 REQ-002 REQ-004 | `tools/spec-drift/src/pr-review/metrics/{eval-score,eval-score.spec,eval-cases,eval-cases.spec}.ts`, `tools/spec-drift/scripts/eval.mts` | — |
| TASK-002 Evaluation set (≥ 30 cases) | REQ-003 | `tools/spec-drift/eval/cases`, `tools/spec-drift/src/pr-review/metrics/eval-set.spec.ts` | TASK-001 |
| TASK-003 Review metrics in the learning loop (kit) | REQ-005 | `cli/src/harness/learning-lib.mjs`, `cli/src/harness/learning-lib.test.mjs`, `cli/src/harness/learn.mjs`, vendored `learning-lib.mjs` (spec-drift, jev-gate, knowledge), `cli/steering/quality-gates.md`, `.harness/steering/quality-gates.md` | — |
| TASK-004 Review quality in the learning view | REQ-005 | `tools/spec-drift/src/audit/audit-insight.output.ts`, `tools/spec-drift/src/audit/audit.service.ts`, `tools/spec-drift/test/insight.e2e-spec.ts`, `tools/spec-drift/ui/audit-dashboard` | TASK-003 |
| TASK-005 Docs | REQ-001…005 | `tools/spec-drift/eval/README.md`, `tools/spec-drift/README.md`, `tools/spec-drift/docs/ROADMAP.md` | TASK-002, TASK-004 |

Plan note (implementation): the repo-wide case validation moved to `eval-set.spec.ts` under TASK-002, so TASK-001 can pass before the set exists.
Plan note (TASK-004): `audit.service.ts` joins the scope — its learning `no_data` must not hide recorded reviews.
