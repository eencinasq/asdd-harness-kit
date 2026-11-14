---
inclusion: always
classification: portable
---

# Session loop (Harness Engineering ∩ ASDD)

> **Protocol file** (`kit_steering_rule` variant) — this file IS the rule-guarded lifecycle; its ordered steps are normative protocol, not a runbook (`_steering-profile.md`, `D-6`).

Closes the gap between **ASDD phases** (manifest + specs) and **coding sessions** (scoped task execution, verification, handoff). Explainer: [README → Guides, then sensors](https://github.com/eencinasq/asdd-harness-kit#guides-then-sensors).

## Artifacts

| File | Owner | Role |
|------|-------|------|
| [`.harness/state/registry.json`](../state/registry.json) | `asdd sync` (generated) | **Global index** — all slices, phases, contributors |
| [`.harness/state/slices/<id>/manifest.json`](../state/slices/) | `asdd sync` (generated) | Per-slice phase machine — never hand-edited |
| [`.harness/state/slices/<id>/sessions/*.json`](../state/slices/) | Agent / human (append-only) | Session log — write once, never modify |
| [`.harness/features/<slice_id>.features.json`](../features/) | Task Planning (create) · Implementation/QA (status+evidence) | Feature tracker |
| [`.harness/PROGRESS.md`](../PROGRESS.md) | `asdd sync` (generated) | Active slices table for humans — rewritten on every sync, never edited |
| [`AGENTS.md`](../../AGENTS.md) | Humans | INIT + definition of done |

## Concurrent work

Concurrent work is safe because:

1. **Session logs are append-only** — each writer creates a new file, never modifies an existing one.
2. **Manifests are generated** — `asdd sync` computes the single source of truth from all session files.
3. **Feature scopes are explicit** — concurrent tasks declare `owner` + `scope_paths`; the invariant checker validates non-overlapping scopes.

If two agents write sessions for the same slice simultaneously, both files exist and both are included in the next `sync-state` run.

## INIT order

See `AGENTS.md` → INIT (registry, slice manifest, features, JIT steering, then pick work).

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
- `evidence_hash` — written by `asdd sync` when the feature becomes `passing` (never by hand): the hash of the files its `scope_paths` cover
- `notes` — optional; link REQs / blockers
- `req_ids` — optional traceability
- `source_tasks` — repository-relative path to the `tasks.md` that produced these features (required; must exist)
- `owner` — required for concurrent work; unique runtime/worker id
- `scope_paths` — required on every feature; non-empty repo-relative files/directories this task may edit (planned paths may not exist yet)
- `depends_on` — optional task ids; all listed dependencies must be `passing` before dispatch

**Rules:** one `in_progress` by default. Multiple tasks may be `in_progress` only when each has a unique `owner`, non-empty non-overlapping `scope_paths`, and the coordinator has written a session file for the slice. Scope overlap includes a file and its ancestor directory. Workers must not edit shared Harness state, registry, manifests, or session files of other agents. `passing` requires non-empty `evidence` and a passing Verify-on-Stop check in the same session; on repeated verify fail → `blocked` + [agent-failure-log](../../docs/agent-failure-log.md).

**Evidence hash:** run the verification, set `passing` with `evidence`, then run `asdd sync`: it records `evidence_hash`, the hash of the files the feature's `scope_paths` cover. No commit is needed; developers commit when they finish their work. Spec drift check `DRIFT-02` reopens the feature when any of those files changes after that point (set it back to `in_progress`, rerun the verification). Missing `scope_paths` or `evidence` is reported as `DRIFT-06`, at the severity set by `drift.contract` in `.harness/config/project.json` (`warn` by default, `fail` once slices are migrated).

## When to create / update features.json

1. **Task Planning (mandatory):** project `tasks.md` → `.harness/features/<slice_id>.features.json`; write a session with `features_path` and run `sync-state` so the generated `paths.features` points at it. Do not hand off to Implementation until this file exists with one item per `TASK-NNN`, all `not_started`.
2. **Implementation:** coordinator projects tasks, dependencies, owners, and file scopes into the tracker before dispatch. Set eligible entries to `in_progress`; workers return verification evidence; coordinator audits and records `passing` + evidence and writes a session file.
3. **QA:** may add evidence or mark blocked; do not invent `passing` without running verification.
4. **Do not** replace `tasks.md` — features are the session projection for Harness; tasks remain ASDD SoT for waves/deps.
5. **Do not** backfill historical slices as `passing` without re-running each `verification`. Pre-harness slices may stay without a features file.

## Session files (append-only)

At the end of every significant action, write one session file (format and event types: [manifest.md](./manifest.md)), then run `asdd sync --slice <slice-id>` to regenerate the manifest, registry, and `PROGRESS.md`.

## Waves, dependencies, and concurrency

`tasks.md` waves define dependency barriers; task dependencies determine which DAG nodes are ready. Same-wave tasks may run concurrently only when every task has an explicit owner and a non-empty `scope_paths`, scopes do not overlap (including parent/child directory paths), and the coordinator has written a session file for the slice. Tasks without these declarations run serially.

The coordinator alone writes `.features.json`, session files, and updates shared state via `sync-state`. Workers edit only their owned task scope and report changed files, verification commands/results, blockers, and relevant requirement coverage. The coordinator reconciles results and marks a task `passing` only after evidence review. Shared-state changes happen at wave barriers. For supervised DAG orchestration across agents, use the `orchestration` skill if installed.

ASDD-Lite remains single-worker and serial (machine-enforced: a lite slice with more than one `in_progress` feature fails invariants). Lite slices are the default; growth evidence forces escalation — see [asdd-lite.md](./asdd-lite.md).

## Gold-plating (negative space)

Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors.

Mapped files are the paths named by that `intent.md` and by the slice `design.md` and `tasks.md` that trace to it, plus `scope_paths` on the in-progress feature, plus any test file (per the `Test file globs` binding) that names a REQ of that slice. Slice harness records (session files, features) stay writable. Any other product file is out of scope. A refactor inside a mapped file is in scope only when that spec, the current task, or the slice phase `refactor` requests it.

Scope control is deterministic: this file's mapping plus `features.mjs`.

## Verify-on-Stop (enforcement)

Before the session ends, and before a feature is marked `passing`, the agent shall run:

```bash
asdd check --live
```

Exit 0 is required. WARN lines do not block. Any FAIL blocks completion. The agent shall fix every FAIL and shall not mark the feature `passing` while the command exits non-zero. Live mode does not require `JEV_API_KEY` (Jev is not a harness gate).

Cursor (`stop`) and Claude Code (`Stop`) run this automatically through `asdd verify`: a FAIL comes back as the next prompt (Cursor `loop_limit` 3; Claude respects `stop_hook_active`), and the session ends only on exit 0. After the loop limit, a remaining FAIL still means the feature is not `passing`. Other runtimes do not inject the prompt; the `--live` run is still mandatory before handoff. Every failing `--live` run is recorded as a learning signal ([Learning Gate](./quality-gates.learn.md)).

## Escalation

A gold-plating violation → revert or map the file (`DRIFT-01` remedies), never silent scope widening; a Verify-on-Stop FAIL past the loop limit → not `passing`, escalate to the Tech Lead. Session close and conflict precedence: [controls.md](./controls.md).
