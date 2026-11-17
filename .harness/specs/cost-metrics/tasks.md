# cost-metrics — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 cost-lib: transcript usage, snapshot deltas, prices, unknown runtimes | REQ-001, REQ-002, REQ-003 | `cli/src/harness/cost-lib.mjs`, `cli/src/harness/cost-lib.test.mjs`, `package.json` |
| TASK-002 Stop hook records the Claude transcript usage on its span | REQ-001 | `cli/src/harness/verify-on-stop.mjs`, `cli/src/harness/verify-on-stop.test.mjs` |
| TASK-003 metrics.cost in status --metrics/--json/--html (single computation) | REQ-001, REQ-002, REQ-003, REQ-004 | `cli/src/harness/pipeline-metrics.mjs`, `cli/src/harness/pipeline-metrics.test.mjs`, `cli/src/harness/pipeline-html.mjs`, `cli/src/harness/pipeline-html.test.mjs`, `tools/knowledge/src/harness/pipeline-metrics.mjs`, `tools/knowledge/src/harness/cost-lib.mjs` |
