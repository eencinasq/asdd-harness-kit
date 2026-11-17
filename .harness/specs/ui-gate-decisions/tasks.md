# ui-gate-decisions — Tasks (lite)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

Single wave. Serial. Owner: `cursor`.

## TASK-001 — Host/Origin guards on write (REQ-005)

Export and enforce loopback `Host` + `Origin`/`Referer` checks on `POST /api/gates/decide` (and reject other writes without a matching origin). Wrong/missing headers → `403`, no `asdd` spawn.

- **Files:** `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`
- **REQ:** REQ-005
- **Verification:** `node --test cli/src/harness/ui-server.test.mjs`

## TASK-002 — List pending gates (REQ-001)

`GET /api/gates` returns pending WARN gates (no `acknowledged_by`) with evidence/concerns and drift status; Gates tab in the shell renders them.

- **Files:** `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`, `cli/src/harness/ui/**`
- **REQ:** REQ-001
- **Verification:** `node --test cli/src/harness/ui-server.test.mjs`

## TASK-003 — Decide via `asdd gate-decide` (REQ-002…004)

Add `gate-decide.mjs` + command registration; UI POST runs it after Host/Origin pass; `decided_by` from git/`HARNESS_AUTHOR`; mandatory note; non-zero exit surfaces output and writes nothing else from the server.

- **Files:** `cli/src/harness/gate-decide.mjs`, `cli/src/harness/gate-decide.test.mjs`, `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`, `cli/src/harness/ui/**`, `cli/src/harness/commands.mjs`, `package.json`, `cli/versions.json`, `README.md`
- **REQ:** REQ-002, REQ-003, REQ-004
- **Verification:** `node --test cli/src/harness/gate-decide.test.mjs cli/src/harness/ui-server.test.mjs`
