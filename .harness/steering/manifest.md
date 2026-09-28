---
inclusion: always
---

# State Manifest — schema v2.0 (multi-slice)

Every ASDD agent run **must** read state at start and **write** updates at end of a completed phase. Propose-only is not enough.

## Two files (do not confuse)

| File | Role | Agents |
|------|------|--------|
| [`.harness/state/manifest.json`](../state/manifest.json) | **Global index** — `schema_version: "2.0"`, `domain_model_version`, `active_slices[]` | **Read** always. **Write** only the matching `active_slices[]` row (`status`, `phase`, `manifest`, `progress`, `features`, optional notes). Never store phase gates / `confidence_chain` here. |
| [`.harness/state/slices/<slice-id>/manifest.json`](../state/slices/) | **Per-slice phase machine** — gates, CCS, `confidence_chain`, `paths`, heartbeats | **Write** here under the slice lock. This is the ASDD SoT for the slice. |

Also: [`.harness/PROGRESS.md`](../PROGRESS.md) index row · [`.harness/progress/<slice-id>.md`](../progress/) session record · locks under [`.harness/state/locks/`](../state/locks/). Contract: [session-loop.md](./session-loop.md).

## Per-slice manifest — required fields

| Field | Role |
|-------|------|
| `schema_version` | Prefer `"2.0"` |
| `slice_id` | Stable id (matches folder name and registry row) |
| `phase` | Current ASDD phase |
| `status` | `in_progress` \| `DONE` \| `PARKED` \| `ABANDONED` |
| `gates` | Per-phase gate objects (`discovery` … `knowledge`) when the phase has been run |
| `ccs` / `confidence_chain` | Cumulative score + append-only phase scores |
| `phase_data` | Paths and phase-specific metadata |
| `paths` | `spec_dir`, `domain_model`, `knowledge_base`, `features`, `progress` |
| `mode` | Optional — `"full"` (default) or `"lite"`. Lite slices skip CCS/gates per [asdd-lite.md](./asdd-lite.md). |
| `agent_heartbeats` | Last-run timestamps per agent |

Historical pre-v2 stubs may omit `gates` / `ccs` — do not invent scores; invariants WARN only.

## Rules

1. **Resolve the slice** from the user prompt, `PROGRESS.md`, or the registry row — then work under `paths.spec_dir` (`.harness/specs/<slice>/`).
2. **Hold the lock** before writing per-slice manifest, progress, or features ([session-loop.md](./session-loop.md)).
3. **Advance phase only** when the gate for that phase is PASSED/READY per [quality-gates.md](./quality-gates.md).
4. **Append** to `confidence_chain` and update `agent_heartbeats.<agent>` on every completed phase run.
5. Put artifact paths under `phase_data` using **`.harness/specs/<slice>/...`** prefixes.
6. Do not delete historical `confidence_chain` entries for the slice.
7. Set `paths.progress` → `.harness/progress/<slice_id>.md`. Set `paths.features` → `.harness/features/<slice_id>.features.json` at **Task Planning** (required before Implementation). Omit `paths.features` until that file exists.
8. **On DONE (knowledge):** set per-slice `status: DONE`, `phase: knowledge`; sync global registry row; optionally copy a freeze to `.harness/state/archive/<slice_id>.json`; delete the lock; update `PROGRESS.md`.
9. **PARKED / ABANDONED:** allowed statuses for incomplete or deferred slices. Do not mark `DONE` unless knowledge (or an explicit human supersede) completed. Sync progress file to the same status.
10. **Never** treat the global manifest as a single active-slice phase machine (that was schema v1).

## Parent / subagent INIT

1. Read `.harness/PROGRESS.md` then global `.harness/state/manifest.json` (index).
2. If every slice is `DONE` or `PARKED`/`ABANDONED` and the human did not name a slice: **stop** — ask for a new `intent.md` / Discovery, or an explicit unpark. Do not invent a tracker item.
3. Claim the lock; read `.harness/state/slices/<slice-id>/manifest.json`.
4. Read features from `paths.features` when present.
5. Read required files from `.harness/steering/` for the phase.
6. During Implementation, one feature at a time ([session-loop.md](./session-loop.md)).
7. On phase complete: **write per-slice manifest**, sync global registry row + `PROGRESS.md` row; on implementation also update features evidence.
