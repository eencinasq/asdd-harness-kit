# asdd-p4 — Spec (lite)

## Intent

Deliver ASDD-ROADMAP **P4.1, P4.3, and P4.4** only: tighter bi-directional tracker sync planning on top of `external-trackers`, an advisory-only Verify-on-Stop mode for teams not ready for fail-closed, and an experimental opt-in spec-as-source pilot. **Out of scope (deferred to a later kit version):** P4.2 Cencosud presets.

## Requirements

- **REQ-001 (MUST).** `asdd tracker-sync [--slice <id>] [--json] [--apply]` shall build a deterministic sync plan from slice sessions + `docs/pitches/*/handoff.yaml` (events: slice created, phase completed, feature passing, slice DONE, dissent) for Linear/Jira/GitHub/manual. Default is plan-only (no tracker MCP calls). With `--apply`, append a local receipt under `.harness/state/tracker-sync/` (never invent tracker comments without a plan). Incomplete handoff yields WARN entries, not silent success.
- **REQ-002 (MUST).** Project config may set `stop.mode` to `fail_closed` (default) or `advisory` (also via `HARNESS_STOP_MODE`). In `advisory`, Verify-on-Stop still runs `asdd check --live` and records learning signals, but must not block the session (no Claude `decision: block`, no Cursor blocking follow-up); it shall emit a clear advisory notice on stderr and exit 0 for the hook protocol.
- **REQ-003 (MUST).** `asdd spec-source [--slice <id>] [--json]` shall be an **opt-in experimental** pilot: when `capabilities.spec_as_source` is not `true`, exit non-zero with guidance. When enabled, print a read-only inventory of MUST REQs vs feature `req_ids` / test mentions (Tessl-like visibility) without rewriting product source. Ship `cli/docs/guides/spec-as-source.md` stating code remains editable and this is not the default SoT.
