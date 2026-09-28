---
inclusion: always
---

# Session loop (Harness Engineering ∩ ASDD)

Closes the gap between **ASDD phases** (manifest + specs) and **coding sessions** (one feature, verify, handoff). Explainer + diagrams: [`docs/asdd-and-harness-engineering.md`](../../docs/asdd-and-harness-engineering.md).

## Artifacts

| File | Owner | Role |
|------|-------|------|
| [`.harness/PROGRESS.md`](../PROGRESS.md) | All agents | **Index only** — active slices table + lock rules; never append session records here |
| [`.harness/progress/<slice_id>.md`](../progress/) | Agent owning the slice | Per-slice session record (append-only); Current Verified State lives here |
| [`.harness/features/<slice_id>.features.json`](../features/) | Task Planning (create) · Implementation/QA (status+evidence) | Feature tracker |
| [`.harness/state/manifest.json`](../state/manifest.json) | All agents (read) | **Global index** — domain model version + slice registry (schema v2.0) |
| [`.harness/state/slices/<slice_id>/manifest.json`](../state/slices/) | Agent owning the slice | Per-slice ASDD phase + gates + confidence |
| [`.harness/state/locks/<slice_id>.lock`](../state/locks/) | Agent owning the slice | Mutex — JSON `{agent, started, slice}`; create on start, delete on handoff |
| [`AGENTS.md`](../../AGENTS.md) | Humans | INIT + definition of done |

## Multi-agent lock protocol

Applies to **all runtimes**: Junie, Cursor, Kiro, Claude Code, or any other agent.

1. **Before picking a slice** — read `.harness/state/locks/<slice-id>.lock`.
   - File absent → slice is free; you may claim it.
   - File present → another agent owns it; pick a different slice or wait for the lock to be removed.
2. **When you claim a slice** — create the lock file:
   ```json
   { "agent": "<your-runtime-id>", "started": "<ISO-8601>", "slice": "<slice-id>" }
   ```
3. **While you hold the lock** — you are the only writer for:
   - `.harness/state/slices/<slice-id>/manifest.json`
   - `.harness/progress/<slice-id>.md`
   - `.harness/features/<slice-id>.features.json`
4. **On handoff or session end** — delete `.harness/state/locks/<slice-id>.lock` and update `.harness/PROGRESS.md` index row.
5. **PROGRESS.md is shared** — only update the slice row in the index table; never append full session records there.

## ASDD-Lite slices

Slices with `mode: "lite"` in their per-slice manifest follow the lightweight pipeline ([asdd-lite.md](./asdd-lite.md)) — 4 phases instead of 9, no CCS/gates, single-agent ownership. The session-loop contract (features.json, PROGRESS.md, locks) is identical.

## Feature item shape

Each item in `.features.json`:

- `id` — usually `TASK-NNN` (stable)
- `priority` — lower = sooner
- `area` — slice or module
- `title` — short
- `user_visible_behavior` — observable outcome (from Acceptance / REQ)
- `status` — `not_started` \| `in_progress` \| `blocked` \| `passing`
- `verification` — shell/Nx commands or steps to prove it
- `evidence` — filled only when passing (what ran + result)
- `notes` — optional; link REQs / blockers
- `req_ids` — optional traceability

**Rules:** at most one `in_progress`; `passing` requires non-empty `evidence`; on repeated verify fail → `blocked` + [agent-failure-log](../../docs/agent-failure-log.md).

## When to create / update features.json

1. **Task Planning (mandatory):** project `tasks.md` → `.harness/features/<slice_id>.features.json`; set `manifest.paths.features`. Do not hand off to Implementation until this file exists with one item per `TASK-NNN`, all `not_started`.
2. **Implementation:** flip **one** item to `in_progress`; on green verify → `passing` + evidence; update `PROGRESS.md`. Waves in `tasks.md` are dependency groups only — serialize through this tracker (see Implementation agent).
3. **QA:** may add evidence or mark blocked; do not invent `passing` without running verification.
4. **Do not** replace `tasks.md` — features are the session projection for Harness; tasks remain ASDD SoT for waves/deps.
5. **Do not** backfill historical slices as `passing` without re-running each `verification`. Pre-harness slices may stay without a features file.

## Waves vs one `in_progress`

`tasks.md` waves describe **what can start after deps**. `.features.json` allows **at most one** `in_progress`. Spawn a context-fresh sub-agent per TASK, but wait until that feature is `passing` or `blocked` before starting the next. Do not mark a whole wave `in_progress`.

## INIT order

See root `AGENTS.md` INIT. Always: PROGRESS → global index → per-slice manifest → steering. Read features when present. Pick one feature only in `implementation`. If the board is only `DONE`/`PARKED`/`ABANDONED` and no slice was named: stop and ask the human (new intent or unpark).
