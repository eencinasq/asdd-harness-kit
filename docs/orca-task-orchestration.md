# Orca task orchestration

This guide describes how to coordinate independent implementation tasks from one ASDD slice with Orca. The Harness remains the source of truth for specifications, dependency declarations, task status, evidence, and slice ownership. Orca supervises workers and task handoffs; it does not replace those artifacts.

## Preconditions

- `tasks.md` and `design.md` are `READY`; each task has a stable `TASK-NNN` id, requirement links, acceptance criterion, dependencies, verification, and writable file scope.
- `.harness/features/<slice>.features.json` projects each task, including `depends_on` and `scope_paths`. Assign a unique `owner` when dispatching.
- The coordinator has claimed `.harness/state/locks/<slice>.lock`. Workers do not claim or remove that lock.
- Only tasks whose dependencies are `passing` are eligible. Same-wave tasks are not automatically safe to run together: their writable scopes must be non-empty and disjoint. Treat a path and its parent directory as overlapping.

## Coordinator and worker roles

The coordinator owns the slice lock and shared Harness state. It validates readiness, assigns each task to one worker, gives each worker only its task context and writable scope, gathers results, reviews the combined diff, runs any wave-level verification, and updates statuses/evidence. It alone writes feature trackers, manifests, progress records, and the shared progress index while workers are active.

A worker implements only the assigned task. It does not edit other task scopes or shared Harness state. On completion it reports task id, changed paths, requirement coverage, verification commands and results, review findings, and any blockers. It must not claim `passing`; that decision belongs to the coordinator after evidence review.

## DAG workflow

1. Read the slice state, lock, `tasks.md`, design, requirements, steering, and feature tracker. Check the invariant script and ensure task ids, dependencies, and scopes agree across artifacts.
2. Build a DAG node for each `TASK-NNN`. Add an edge from every dependency task to its dependent task. Preserve explicit wave barriers.
3. Find ready nodes: all dependencies are `passing`, no blocker exists, and each has an assigned owner and exclusive writable scope.
4. Dispatch a ready set concurrently through Orca only when scopes are pairwise disjoint. Otherwise dispatch the conflicting tasks serially. Use separate Orca workers/worktrees where supported.
5. Collect worker reports. Check diffs against each assigned scope, acceptance criteria, requirements, tests, and required defect review. Run the task verification and any wave-level checks.
6. Coordinator records `passing` with evidence for verified tasks, or leaves them `in_progress`/`blocked` with a concrete reason. Do not release dependents until all their dependencies pass.
7. At the wave barrier, reconcile shared state and choose the next ready nodes. At handoff, update the slice record and progress index, then remove the slice lock.

## Example

Suppose a planned slice has these tasks:

| Task | Depends on | Writable scope |
|---|---|---|
| `TASK-001` | none | `src/domain/order/` |
| `TASK-002` | none | `src/infra/order-repository/` |
| `TASK-003` | `TASK-001`, `TASK-002` | `src/application/checkout/` |

The coordinator can dispatch `TASK-001` and `TASK-002` together if the paths are genuinely disjoint and neither task needs to edit shared files. It waits for both to pass before dispatching `TASK-003`. If both first tasks need a shared file such as `src/domain/index.ts`, split that shared change into a prerequisite task or serialize the two tasks.

## Orca interaction pattern

Use Orca as a supervised coordinator: create/dispatch one worker task per ready DAG node, include the scope and dependencies in each task brief, and wait for each worker's completion or escalation before reconciling the wave. Preserve the task id in Orca task names/messages so results map back to `.features.json`. If Orca exposes a native task DAG, represent the same dependency edges there; otherwise the coordinator can dispatch each ready set and enforce barriers manually.

Orca CLI syntax and capabilities vary by installed version. Consult the installed, version-matched orchestration instructions (`orca skills get orchestration`) for exact dispatch, wait, message, and worktree commands. This repository guide defines the workflow contract and intentionally does not assume a particular Orca CLI command surface.

## Safety and fallback

- Missing or overlapping scopes, shared-file edits, uncertain ownership, or unavailable isolated workspaces: serialize the affected tasks.
- Worker failure: preserve its state as `in_progress` or `blocked`, capture the failure, and do not start dependent tasks.
- Coordinator interruption: keep the lock and unfinished task ownership visible; a successor must reconcile worker status before dispatching more work.
- ASDD-Lite remains single-worker and serial.
