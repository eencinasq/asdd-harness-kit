# sensor-fixes — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Scope listing skips files deleted from the working tree | REQ-001 | `cli/src/harness/scope-lib.mjs`, `cli/src/harness/drift-lib.test.mjs`, vendored `tools/{spec-drift,jev-gate,knowledge}/src/harness/scope-lib.mjs` |
| TASK-002 spec-drift MCP e2e reads its sandbox environment | REQ-002 | `tools/spec-drift/test/mcp.e2e-spec.ts` |

Single wave, serial. Each task's acceptance criterion: TASK-001 → AC-001, TASK-002 → AC-002.
