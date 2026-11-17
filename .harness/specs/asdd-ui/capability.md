# asdd-ui — Capability (escalation backfill)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

Backfilled from `spec.md` after `asdd slice escalate` (E1-scope-spread from end-of-slice registration paths).

## Capability

Provide a zero-dependency, read-only local HTTP UI (`asdd ui`) on `127.0.0.1` that aggregates harness views (slices/PROGRESS, pipeline HTML, spec-drift, learning patterns, knowledge search) and refreshes when `.harness/state/` changes.

## Out of scope

- Desktop packaging (Tauri)
- Write / gate-decision endpoints (`ui-gate-decisions`)
- Editing `pipeline-html.mjs` or `tools/spec-drift/ui/**` sources
