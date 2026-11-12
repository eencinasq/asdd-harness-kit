# Requirements: sensor-fixes

## Traceability
- Capability: [capability.md](./capability.md)
- Slice: sensor-fixes (lite, escalated for E1-scope-spread: the vendored `tools/*/src/harness/scope-lib.mjs` copies)
- Source: [spec.md](./spec.md) — REQ IDs unchanged

## EARS Requirements

### REQ-001 — A deletion changes the evidence once (P1)
**Event-driven:** When a file inside a feature's scope is deleted from the working tree, the project file listing shall
leave it out, so the feature's `evidence_hash` changes at the deletion and does not change again when the deletion is
committed.

### REQ-002 — The MCP e2e runs on its sandbox (P2)
**Universal:** The spec-drift in-memory MCP e2e shall set `ANALYSIS_REPO_ROOT` and `PR_REVIEW_ROOT` before the
application's configuration is read, so `analyze_spec_drift` scans the sandbox repository the test creates.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | In a git repository, deleting a committed file in `src` changes `evidenceHash(root, ['src'])`; committing the deletion leaves the hash equal to the value after the deletion (`cli/src/harness/drift-lib.test.mjs`). |
| AC-002 | REQ-002 | `pnpm test:e2e` in `tools/spec-drift` passes `MCP server (in-memory) > analyze_spec_drift runs through the service`. |
