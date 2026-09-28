# Harness Progress Index

Lightweight index of active slices. Each slice has its own session record under `.harness/progress/<slice-id>.md`.

Contract: [`.harness/steering/session-loop.md`](steering/session-loop.md) · Map: [`AGENTS.md`](../AGENTS.md)

> **Multi-agent rule:** claim `.harness/state/locks/<slice-id>.lock` before writing; delete on handoff.

## Active Slices

| Slice | Status | Phase | Lock (agent) | Progress |
|-------|--------|-------|--------------|---------|
| — | — | — | — | *none yet — run Discovery or ASDD-Lite* |

## How to add a new slice

1. Create `.harness/state/slices/<slice-id>/manifest.json` (see [manifest.md](steering/manifest.md)).
2. Add a row above with status `in_progress` (or `not_started` if you track that in progress only).
3. Create `.harness/progress/<slice-id>.md`.
4. Set `manifest.paths.features` when Task Planning is done.
5. Create the lock when an agent picks up the slice; delete on handoff.

## Global state

- Domain model version: set in `.harness/state/manifest.json` to match your domain model doc (`structure.md`).
- Global manifest: `.harness/state/manifest.json` (index only)
- Locks dir: `.harness/state/locks/`
