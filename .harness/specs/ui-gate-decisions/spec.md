# ui-gate-decisions — Spec (lite)

## Intent

Human-decided gates (`decided_by`) are the strongest reason for a UI: today a Tech Lead must open the IDE or CLI to
decide a shaping/delivery gate or acknowledge a WARN. Add one write path to `asdd ui`: decide a gate with its evidence
in view, executed through the existing `asdd` command so session invariants (append-only, one writer) hold
(P5 roadmap, gap G19). The write endpoint must reject forged browser requests (DNS rebinding / CSRF) by validating
`Host` and `Origin` before any decision runs.

Mapped: `cli/src/harness/ui-server*.mjs` (with `ui-server*.test.mjs`), `cli/src/harness/ui/**`, `cli/src/harness/gate-decide*.mjs` (with `gate-decide*.test.mjs`), `cli/src/harness/commands.mjs` (one entry), `package.json` (`test` script entry), `cli/versions.json` (regenerated), `README.md` (command row)

## Requirements

- **REQ-001.** The UI shall list pending gate decisions per slice with their evidence, concerns, and drift status.
- **REQ-002.** WHEN a human decides a gate, the server shall invoke the corresponding `asdd` command and shall never write session, manifest, or registry files directly.
- **REQ-003.** Every decision shall record `decided_by` from the local git user (or `HARNESS_AUTHOR`) and a mandatory note.
- **REQ-004.** IF the `asdd` command exits non-zero, THEN the UI shall show its output and record nothing.
- **REQ-005.** BEFORE accepting a write (gate decision) request, the server shall require `Host` to be a loopback authority (`127.0.0.1` or `localhost`, with the bound port) and `Origin` (or `Referer` if `Origin` is absent) to match that same loopback origin; otherwise it shall respond `403` and shall not invoke `asdd`.

## Depends on

`asdd-ui`.
