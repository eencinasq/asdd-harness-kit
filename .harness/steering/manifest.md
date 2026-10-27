---
inclusion: always
---

# State Manifest — schema v3.0 (multi-slice, session-based)

v3.0 replaces editable manifests with **append-only session logs** + **generated views**. The per-slice manifest and global registry are computed by `sync-state.mjs`, never hand-edited.

## Three layers (do not confuse)

| Layer | Role | Writers |
|-------|------|---------|
| **Session logs** `.harness/state/slices/<id>/sessions/*.json` | Append-only record of every agent/human action | One writer per file (agent or human) |
| **Generated manifest** `.harness/state/slices/<id>/manifest.json` | Computed phase machine — gates, active features, contributors | `sync-state.mjs` only |
| **Generated registry** `.harness/state/registry.json` | Computed global index of all slices | `sync-state.mjs` only |

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

Removed from v2.0: `ccs`, `confidence_chain`, `agent_heartbeats`, `phase_data`. These are replaced by the session log.

## Session file format

Each session is a single JSON file written once, never modified.

```json
{
  "schema_version": "1.0",
  "session_id": "sess-auth-v2-003",
  "timestamp": "2026-10-02T14:30:22Z",
  "agent": "asdd-implementation",
  "human": "bob",
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

## Rules

1. **Resolve the slice** from the registry or user prompt, then work under `paths.specs`.
2. **No locks.** Concurrent work is allowed when features have unique owners and disjoint `scope_paths` (see [session-loop.md](./session-loop.md)).
3. **Write a session file** at the end of every significant action (phase complete, feature start, dissent, override).
4. **Run `sync-state`** after writing sessions: `node .harness/scripts/sync-state.mjs --slice <id>`.
5. **Advance phase** only when the gate for that phase is PASS per [quality-gates.md](./quality-gates.md).
6. **On DONE:** write a `phase_completed` session for `knowledge`, then `sync-state`. The generated manifest will show `status: DONE`.
7. **PARKED / ABANDONED:** write a session with `event_type: checkpoint` and note the status change.
8. **Handoffs:** when picking up another human's work, set `handoff_from` and `handoff_note` in your session file.
9. **Never** edit a generated manifest or registry directly. Always append sessions and regenerate.

## Parent / subagent INIT

1. Read generated `registry.json` for the squad state.
2. If every slice is `DONE` or `PARKED`/`ABANDONED`: **stop** — ask for new intent or unpark.
3. Read the generated per-slice manifest for the target slice.
4. Read features from `paths.features` when present.
5. Read required steering files for the phase (JIT loading per [_runtime-template.md](../../.agents/agents/_runtime-template.md)).
6. During Implementation, use scoped same-slice concurrency contract.
7. On phase complete: **write a session file**, then run `sync-state`.
