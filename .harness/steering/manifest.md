---
inclusion: always
classification: portable
---

# State Manifest — schema v3.0 (multi-slice, session-based)

v3.0 replaces editable manifests with **append-only session logs** + **generated views**. The per-slice manifest and global registry are computed by `asdd sync`, never hand-edited.

## Three layers (do not confuse)

| Layer | Role | Writers |
|-------|------|---------|
| **Session logs** `.harness/state/slices/<id>/sessions/*.json` | Append-only record of every agent/human action | One writer per file (agent or human) |
| **Generated manifest** `.harness/state/slices/<id>/manifest.json` | Computed phase machine — gates, active features, contributors | `asdd sync` only |
| **Generated registry** `.harness/state/registry.json` | Computed global index of all slices | `asdd sync` only |

Also: [`.harness/features/<slice>.features.json`](../features/) feature tracker · [session-loop.md](./session-loop.md) for session rules.

## Per-slice manifest (generated) — fields

| Field | Role |
|-------|------|
| `schema_version` | `"3.0"` |
| `slice_id` | Stable id (matches folder name) |
| `phase` | Current ASDD phase (derived from latest session): `discovery` → `spec` → `validation` → `domain` → `design` → `task_planning` → `implementation` → `qa` → `knowledge`. `refactor` is optional; completing it hands off to `knowledge` |
| `status` | `in_progress` \| `DONE` \| `PARKED` \| `ABANDONED` |
| `mode` | `"lite"` (default), `"full"`, or `"escalated"` — derived from session events (`init-slice --full`, escalation `checkpoint`), never hand-edited |
| `escalation_signals` | Detected growth evidence on lite slices (`E1-scope-spread`, `E3-domain-growth`, `E4-dissent`, `E5-implementation-blocked`) |
| `escalation_required` | `true` when mode is `lite` and signals are open — `sync-state` will not derive `DONE` in this state |
| `gates` | Per-phase gate status: `PASS` / `WARN` / `BLOCK`. `phase_completed` with non-empty `concerns` or a `dissent` gives `WARN`; a Tech Lead `override` session (`human` set) for that phase adds `acknowledged_by`. The next phase starts only on `PASS` or acknowledged `WARN` (`QG-DEC-09`) |
| `active_features` | Features currently `in_progress` with owner and scope |
| `session_log` | Chronological summary of all sessions |
| `contributors` | All agents and humans who wrote sessions |
| `paths` | `specs`, `features`, `tasks` — `features` is set from the latest session carrying `features_path` |

## Session file format

Each session is a single JSON file written once, never modified.

```json
{
  "schema_version": "1.0",
  "session_id": "sess-auth-v2-003",
  "timestamp": "2026-10-02T14:30:22Z",
  "agent": "asdd-implementation",
  "slice_id": "auth-v2",
  "event_type": "feature_started",
  "phase": "implementation",
  "feature_id": "auth-login",
  "scope_paths": ["src/auth/login.ts"],
  "evidence": "Tests passed: 12/12",
  "concerns": [],
  "handoff_from": "alice",
  "handoff_note": "Taking over login implementation."
}
```

**Event types:** `phase_started`, `phase_completed`, `phase_blocked`, `feature_started`, `feature_completed`, `feature_blocked`, `dissent`, `override`, `checkpoint`.

## Rules (invariants)

- **MAN-01.** **Resolve the slice** from the registry or user prompt, then work under `paths.specs`.
- **MAN-02.** **No locks.** Concurrent work is allowed when features have unique owners and disjoint `scope_paths` (see [session-loop.md](./session-loop.md)).
- **MAN-03.** **Write a session file** at the end of every significant action (phase complete, feature start, dissent, override).
- **MAN-04.** **Run `sync-state`** after writing sessions: `asdd sync --slice <id>`.
- **MAN-05.** **Advance phase** only when the gate for that phase is PASS per [quality-gates.md](./quality-gates.md).
- **MAN-06.** **On DONE:** write a `phase_completed` session for `knowledge`, then `sync-state`. The generated manifest will show `status: DONE`.
- **MAN-07.** **PARKED / ABANDONED:** write a `checkpoint` session with `"status": "PARKED"` or `"ABANDONED"` and a `note`. It holds until a later checkpoint sets `"status": "in_progress"` (resume).
- **MAN-08.** **Handoffs:** when picking up another human's work, set `handoff_from` and `handoff_note` in your session file.
- **MAN-09.** **Never** edit a generated manifest or registry directly. Always append sessions and regenerate.

## Negative space

A session file is a log record, not a state update (MAN-09 forbids retroactive edits); `.features.json` is not `tasks.md` (features are the session projection; `tasks.md` stays SoT for waves/deps); no field here is hand-writable — the only inputs are session events.

## Enforcement

`asdd sync` derives manifest/registry/PROGRESS; `asdd check` validates schema, gate chain (`QG-DEC-09`), feature shape, and `DRIFT-*`.

## Escalation

Malformed/conflicting session → fix the format, re-run `sync-state`; gate-chain violation → Tech Lead `override` session; derived state contradicting sessions → `dissent` + steering proposal on the deriver, never a hand-edit.

## Parent / subagent INIT

INIT order lives in `AGENTS.md`; subagents follow the same order. On phase complete: **write a session file**, then run `sync-state` (MAN-03/04).
