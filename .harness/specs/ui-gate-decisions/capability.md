# ui-gate-decisions — Capability (escalation backfill)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

Backfilled after E1 escalation (registration paths).

## Capability

Add the sole write path on `asdd ui`: list pending WARN gates and decide them by spawning `asdd gate-decide` (`decided_by` + mandatory note), with Host/Origin loopback checks against DNS rebinding and CSRF.
