# telemetry-phase2 — Tasks

| Task | Behavior | Verification | Scope |
|------|----------|--------------|-------|
| TASK-001 | telemetry-lib.mjs emit/mintSpan/validateSpan/readTail + `asdd span` + registry commands | telemetry-lib test green (fail-open, ≤4KB, env inheritance, id minting) | cli/src/harness/telemetry-lib.mjs, cli/src/harness/emit-span.mjs, cli/registry/contribution-points.json |
| TASK-002 | instrument command-gate, verify-on-stop, check-invariants, sync-state + _runtime-template rule + measureCommand | spans land in spans.jsonl; verdicts byte-identical; gate test green | cli/src/harness/command-gate.mjs, verify-on-stop.mjs, check-invariants.mjs, sync-state.mjs, cli/agents/_runtime-template.md |
| TASK-003 | validators/telemetry.mjs as 12th validator — warn-only, bounded tail | fixtures: absent/valid/malformed/oversized; never fail | cli/src/harness/validators/telemetry.mjs, cli/src/harness/check-invariants.mjs |
| TASK-004 | profile.mjs — rollup, H-* evaluator, detection spans + signals, profiling.json, exit 0/3/2; project.json/schema; lifecycle smoke | profile test green; lifecycle row; `asdd profile` e2e | cli/src/harness/profile.mjs, cli/src/harness/learning-lib.mjs, cli/scaffold/config/project.schema.json, .harness/config/project.json, cli/test/lifecycle.sh |
| TASK-005 | vault v2.md synced + converged; npm test list updated; full verify | vault status: converged; npm test 0 fail; asdd check 0 FAIL | docs/knowledge-base/profiling-proposals/v2.md, package.json, vault copy |
