---
inclusion: always
---

# Session loop (Harness Engineering ∩ ASDD)

Closes the gap between **ASDD phases** (manifest + specs) and **coding sessions** (scoped task execution, verification, handoff). Explainer: [README → Guides, then sensors](https://github.com/eencinasq/asdd-harness-kit#guides-then-sensors).

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
4. Read steering for the phase (JIT loading per [`_runtime-template.md`](../../.agents/agents/_runtime-template.md)).
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
- `evidence_commit` — required when passing; SHA of the commit that contains the verified code
- `notes` — optional; link REQs / blockers
- `req_ids` — optional traceability
- `source_tasks` — repository-relative path to the `tasks.md` that produced these features (required; must exist)
- `owner` — required for concurrent work; unique runtime/worker id
- `scope_paths` — required on every feature; non-empty repo-relative files/directories this task may edit (planned paths may not exist yet)
- `depends_on` — optional task ids; all listed dependencies must be `passing` before dispatch

**Rules:** one `in_progress` by default. Multiple tasks may be `in_progress` only when each has a unique `owner`, non-empty non-overlapping `scope_paths`, and the coordinator has written a session file for the slice. Scope overlap includes a file and its ancestor directory. Workers must not edit shared Harness state, registry, manifests, or session files of other agents. `passing` requires non-empty `evidence`, an `evidence_commit`, and a passing Verify-on-Stop check in the same session; on repeated verify fail → `blocked` + [agent-failure-log](../../docs/agent-failure-log.md).

**Evidence commit:** run the verification, commit the verified code, then record that commit's SHA as `evidence_commit` (the features file itself is a harness record and may change afterwards). Spec drift check `DRIFT-02` reopens the feature when any file under its `scope_paths` changes after that commit. Missing `scope_paths`, `evidence`, or `evidence_commit` is reported as `DRIFT-06`, at the severity set by `drift.contract` in `.harness/config/project.json` (`warn` by default, `fail` once slices are migrated).

## When to create / update features.json

1. **Task Planning (mandatory):** project `tasks.md` → `.harness/features/<slice_id>.features.json`; write a session with `features_path` and run `sync-state` so the generated `paths.features` points at it. Do not hand off to Implementation until this file exists with one item per `TASK-NNN`, all `not_started`.
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

The coordinator alone writes `.features.json`, session files, and updates shared state via `sync-state`. Workers edit only their owned task scope and report changed files, verification commands/results, blockers, and relevant requirement coverage. The coordinator reconciles results and marks a task `passing` only after evidence review. Shared-state changes happen at wave barriers. For supervised DAG orchestration across agents, use the `orchestration` skill if installed.

ASDD-Lite remains single-worker and serial (machine-enforced: a lite slice with more than one `in_progress` feature fails invariants). Lite slices are the default; growth evidence forces escalation — see [asdd-lite.md](./asdd-lite.md).

## Gold-plating

Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors.

Mapped files are the paths named by that `intent.md` and by the slice `design.md` and `tasks.md` that trace to it, plus `scope_paths` on the in-progress feature, plus any test file (per the `Test file globs` binding) that names a REQ of that slice. Slice harness records (session files, features) stay writable. Any other product file is out of scope. A refactor inside a mapped file is in scope only when that spec, the current task, or the slice phase `refactor` requests it.

Harness invariants do not call Jev. Scope control is deterministic (this file's mapping + `features.mjs`). Jev is skill-scoped to `shape-up` / `product-delivery` only ([jev.md](./jev.md)).

## Verify-on-Stop

Before the session ends, and before a feature is marked `passing`, the agent shall run:

```bash
node .harness/scripts/check-invariants.mjs --live
```

Exit 0 is required. WARN lines do not block. Any FAIL blocks completion. The agent shall fix every FAIL and shall not mark the feature `passing` while the command exits non-zero. Live mode does not require `JEV_API_KEY` (Jev is not a harness gate).

Both Cursor and Claude Code run this automatically. `.cursor/hooks.json` binds `stop` to `node .harness/scripts/verify-on-stop.mjs` (`loop_limit` 3, `failClosed` true); `.claude/settings.json` binds `Stop` to the same script. When the invariants run exits non-zero, the hook submits the FAIL output as the next prompt (Cursor) or a `decision: block` reason (Claude, respecting `stop_hook_active`) so the agent corrects the harness state before the session ends. When the command exits 0, the hook returns `{}` and the session may end. The hook does not inject a follow-up when `status` is `aborted` or `error`. After `loop_limit`, a remaining FAIL still means the feature is not `passing`.

Other runtimes do not inject that prompt. The `--live` command is still mandatory before handoff (see the enforcement matrix in [README → How a session works](https://github.com/eencinasq/asdd-harness-kit#how-a-session-works)).

Session close, and what wins when a control disagrees with this file, is in [controls.md](./controls.md). Gold-plating in this file still decides which files may change.
