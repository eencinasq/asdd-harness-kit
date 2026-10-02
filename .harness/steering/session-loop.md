---
inclusion: always
---

# Session loop (Harness Engineering ∩ ASDD)

Closes the gap between **ASDD phases** (manifest + specs) and **coding sessions** (scoped task execution, verification, handoff). Explainer + diagrams: [`docs/asdd-and-harness-engineering.md`](../../docs/asdd-and-harness-engineering.md).

## Artifacts

| File | Owner | Role |
|------|-------|------|
| [`.harness/state/registry.json`](../state/registry.json) | `sync-state.mjs` (generated) | **Global index** — all slices, phases, contributors |
| [`.harness/state/slices/<id>/manifest.json`](../state/slices/) | `sync-state.mjs` (generated) | Per-slice phase machine — never hand-edited |
| [`.harness/state/slices/<id>/sessions/*.json`](../state/slices/) | Agent / human (append-only) | Session log — write once, never modify |
| [`.harness/features/<slice_id>.features.json`](../features/) | Task Planning (create) · Implementation/QA (status+evidence) | Feature tracker |
| [`.harness/PROGRESS.md`](../PROGRESS.md) | Humans / generated | **Index only** — active slices table; never append session records here |
| [`AGENTS.md`](../../AGENTS.md) | Humans | INIT + definition of done |

## No locks (v3.0)

The v2 lock protocol (`state/locks/<slice>.lock`) has been removed. Concurrent work is safe because:

1. **Session logs are append-only** — each writer creates a new file, never modifies an existing one.
2. **Manifests are generated** — `sync-state.mjs` computes the single source of truth from all session files.
3. **Feature scopes are explicit** — concurrent tasks declare `owner` + `scope_paths`; the invariant checker validates non-overlapping scopes.

If two agents write sessions for the same slice simultaneously, both files exist and both are included in the next `sync-state` run.

## INIT order

1. Read generated `.harness/state/registry.json` for squad state.
2. Read generated `.harness/state/slices/<slice-id>/manifest.json` for the target slice.
3. Read features when `paths.features` is set.
4. Read steering for the phase (JIT loading per [`_runtime-template.md`](../agents/_runtime-template.md)).
5. Pick work:
   - All slices `DONE`/`PARKED`/`ABANDONED` and no named slice → **stop**; ask for new intent or unpark.
   - `phase` is `implementation` → choose dependency-ready features. Same-slice parallel work is allowed only with explicit unique owners and disjoint file scopes; otherwise work serially.

## Feature item shape

Each item in `.features.json`:

- `id` — usually `TASK-NNN` (stable)
- `priority` — lower = sooner
- `area` — slice or module
- `title` — short
- `user_visible_behavior` — observable outcome (from Acceptance / REQ)
- `status` — `not_started` | `in_progress` | `blocked` | `passing`
- `verification` — shell/Nx commands or steps to prove it
- `evidence` — filled only when passing (what ran + result)
- `notes` — optional; link REQs / blockers
- `req_ids` — optional traceability
- `source_tasks` — repository-relative path to the `tasks.md` that produced these features (required; must exist)
- `owner` — required for concurrent work; unique runtime/worker id
- `scope_paths` — required for concurrent work; non-empty repo-relative files/directories this task may edit
- `depends_on` — optional task ids; all listed dependencies must be `passing` before dispatch

**Rules:** one `in_progress` by default. Multiple tasks may be `in_progress` only when each has a unique `owner`, non-empty non-overlapping `scope_paths`, and the coordinator has written a session file for the slice. Scope overlap includes a file and its ancestor directory. Workers must not edit shared Harness state, registry, manifests, or session files of other agents. `passing` requires non-empty `evidence` and a passing Verify-on-Stop check in the same session; on repeated verify fail → `blocked` + [agent-failure-log](../../docs/agent-failure-log.md).

## When to create / update features.json

1. **Task Planning (mandatory):** project `tasks.md` → `.harness/features/<slice_id>.features.json`; set `manifest.paths.features`. Do not hand off to Implementation until this file exists with one item per `TASK-NNN`, all `not_started`.
2. **Implementation:** coordinator projects tasks, dependencies, owners, and file scopes into the tracker before dispatch. Set eligible entries to `in_progress`; workers return verification evidence; coordinator audits and records `passing` + evidence and writes a session file.
3. **QA:** may add evidence or mark blocked; do not invent `passing` without running verification.
4. **Do not** replace `tasks.md` — features are the session projection for Harness; tasks remain ASDD SoT for waves/deps.
5. **Do not** backfill historical slices as `passing` without re-running each `verification`. Pre-harness slices may stay without a features file.

## Session files (append-only)

At the end of every significant action, write a session file:

```bash
node .harness/scripts/sync-state.mjs --slice <slice-id>
```

After writing sessions, run `sync-state` to regenerate the manifest and registry.

Session file format (one JSON file per action, never edited):

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

## Waves, dependencies, and concurrency

`tasks.md` waves define dependency barriers; task dependencies determine which DAG nodes are ready. Same-wave tasks may run concurrently only when every task has an explicit owner and a non-empty `scope_paths`, scopes do not overlap (including parent/child directory paths), and the coordinator has written a session file for the slice. Tasks without these declarations run serially.

The coordinator alone writes `.features.json`, session files, and updates shared state via `sync-state`. Workers edit only their owned task scope and report changed files, verification commands/results, blockers, and relevant requirement coverage. The coordinator reconciles results and marks a task `passing` only after evidence review. Shared-state changes happen at wave barriers. See [Orca task orchestration](../../docs/orca-task-orchestration.md) for a supervised DAG workflow.

ASDD-Lite remains single-worker and serial.

## Gold-plating

Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors.

Mapped files are the paths named by that `intent.md` and by the slice `design.md` and `tasks.md` that trace to it, plus `scope_paths` on the in-progress feature. Slice harness records (session files, features) stay writable. Any other product file is out of scope. A refactor inside a mapped file is in scope only when that spec, the current task, or the slice phase `refactor` requests it.

## Verify-on-Stop

Before the session ends, and before a feature is marked `passing`, the agent shall run:

```bash
node .harness/scripts/check-invariants.mjs
```

Exit 0 is required. WARN lines do not block. Any FAIL blocks completion. The agent shall fix every FAIL and shall not mark the feature `passing` while the command exits non-zero.

Cursor runs that command automatically. `.cursor/hooks.json` binds the `stop` event to `node .harness/scripts/verify-on-stop.mjs` (`timeout` 60, `loop_limit` 3, `failClosed` true). When `check-invariants.mjs` exits non-zero, the hook submits the FAIL output as the next user message so the agent corrects the harness state before the session ends. When the command exits 0, the hook returns `{}` and the session may end. The hook does not inject a follow-up when `status` is `aborted` or `error`. After `loop_limit`, a remaining FAIL still means the feature is not `passing`.

Other runtimes do not inject that prompt. The same command is still mandatory before handoff.

Session close, and what wins when a control disagrees with this file, is in [controls.md](./controls.md). Gold-plating in this file still decides which files may change.
