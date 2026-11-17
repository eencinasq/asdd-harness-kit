# asdd-ui — Requirements (escalation backfill)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

Backfilled from `spec.md` after E1 escalation.

| ID | Statement |
|----|-----------|
| REQ-001 | The CLI shall provide `asdd ui [--port <n>]` that serves on `127.0.0.1` only and adds no runtime dependency. |
| REQ-002 | The UI shall show slices (registry/PROGRESS), the pipeline view, spec-drift results, open learning patterns, and a knowledge search. |
| REQ-003 | WHEN files under `.harness/state/` change, the open UI shall refresh without a manual reload. |
| REQ-004 | The server shall expose no endpoint that writes to the repository. |
