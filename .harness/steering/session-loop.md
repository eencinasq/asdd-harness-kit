---
inclusion: always
---

# Session loop (Harness Engineering ∩ ASDD)

Closes the gap between **ASDD phases** (manifest + specs) and **coding sessions** (scoped task execution, verification, handoff). Explainer + diagrams: [`docs/asdd-and-harness-engineering.md`](../../docs/asdd-and-harness-engineering.md).

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
- `owner` — required for concurrent work; unique runtime/worker id
- `scope_paths` — required for concurrent work; non-empty repo-relative files/directories this task may edit
- `depends_on` — optional task ids; all listed dependencies must be `passing` before dispatch

**Rules:** one `in_progress` by default. Multiple tasks may be `in_progress` only when each has a unique `owner`, non-empty non-overlapping `scope_paths`, and the coordinator holds the slice lock. Scope overlap includes a file and its ancestor directory. Workers must not edit shared Harness state, tracker, manifests, progress records, or index. `passing` requires non-empty `evidence` and a passing Verify-on-Stop check in the same session; on repeated verify fail → `blocked` + [agent-failure-log](../../docs/agent-failure-log.md).

## When to create / update features.json

1. **Task Planning (mandatory):** project `tasks.md` → `.harness/features/<slice_id>.features.json`; set `manifest.paths.features`. Do not hand off to Implementation until this file exists with one item per `TASK-NNN`, all `not_started`.
2. **Implementation:** coordinator projects tasks, dependencies, owners, and file scopes into the tracker before dispatch. Set eligible entries to `in_progress`; workers return verification evidence; coordinator audits and records `passing` + evidence and updates shared state.
3. **QA:** may add evidence or mark blocked; do not invent `passing` without running verification.
4. **Do not** replace `tasks.md` — features are the session projection for Harness; tasks remain ASDD SoT for waves/deps.
5. **Do not** backfill historical slices as `passing` without re-running each `verification`. Pre-harness slices may stay without a features file.

## Waves, dependencies, and concurrency

`tasks.md` waves define dependency barriers; task dependencies determine which DAG nodes are ready. Same-wave tasks may run concurrently only when every task has an explicit owner and a non-empty `scope_paths`, scopes do not overlap (including parent/child directory paths), and the coordinator holds the slice lock. Tasks without these declarations run serially.

The coordinator alone writes `.features.json`, manifests, progress records, and `.harness/PROGRESS.md`. Workers edit only their owned task scope and report changed files, verification commands/results, blockers, and relevant requirement coverage. The coordinator reconciles results and marks a task `passing` only after evidence review. Shared-state changes happen at wave barriers. See [Orca task orchestration](../../docs/orca-task-orchestration.md) for a supervised DAG workflow.

ASDD-Lite remains single-worker and serial.

## Gold-plating

Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors.

Mapped files are the paths named by that `intent.md` and by the slice `design.md` and `tasks.md` that trace to it, plus `scope_paths` on the in-progress feature. ASDD-Lite uses `.harness/specs/<slice>/spec.md` in place of `intent.md`. Slice harness records this contract requires (per-slice manifest, features, progress, lock, and the `PROGRESS.md` index row) stay writable. Any other product file is out of scope. A refactor inside a mapped file is in scope only when that spec, the current task, or the slice phase `refactor` requests it.

## Verify-on-Stop

Before the session ends, and before a feature is marked `passing`, the agent shall run:

```bash
node .harness/scripts/check-invariants.mjs
```

Exit 0 is required. WARN lines do not block. Any FAIL blocks completion. The agent shall fix every FAIL and shall not mark the feature `passing` while the command exits non-zero.

Cursor runs that command automatically. `.cursor/hooks.json` binds the `stop` event to `node .harness/scripts/verify-on-stop.mjs` (`timeout` 60, `loop_limit` 3, `failClosed` true). When `check-invariants.mjs` exits non-zero, the hook submits the FAIL output as the next user message so the agent corrects the harness state before the session ends. When the command exits 0, the hook returns `{}` and the session may end. The hook does not inject a follow-up when `status` is `aborted` or `error`. After `loop_limit`, a remaining FAIL still means the feature is not `passing`.

Other runtimes do not inject that prompt. The same command is still mandatory before handoff.

Session close, and what wins when a control disagrees with this file, is in [controls.md](./controls.md). Gold-plating in this file still decides which files may change.

## INIT order

See root `AGENTS.md` INIT. Always: PROGRESS → global index → per-slice manifest → steering. Read features when present. Pick dependency-ready features in `implementation`; concurrent work must meet the ownership and file-scope contract above. If the board is only `DONE`/`PARKED`/`ABANDONED` and no slice was named: stop and ask the human (new intent or unpark).
