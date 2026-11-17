# ui-gate-decisions — Requirements (escalation backfill)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

| ID | Statement |
|----|-----------|
| REQ-001 | List pending gate decisions per slice with evidence, concerns, and drift status. |
| REQ-002 | Decide via `asdd` command; never write session/manifest/registry from the server. |
| REQ-003 | Record `decided_by` from git/`HARNESS_AUTHOR` and a mandatory note. |
| REQ-004 | Non-zero `asdd` exit → show output; record nothing via the server. |
| REQ-005 | Write requests require loopback Host + Origin/Referer or 403. |
