# Requirements: kit-hygiene

## Traceability
- Capability: [capability.md](capability.md)
- Intent: [intent.md](intent.md) (MH-01 … MH-06)
- Slice: kit-hygiene

**Shipped guidance** (term used below): the Markdown and rule files the installer copies into a project — `AGENTS.md`, the portable `.harness/steering/*.md` and `templates/`, `.agents/agents/`, `.agents/skills/`, `.agents/modules/`, `scripts/templates/`, the seeded `docs/` logs, and runtime rule files under `runtimes/`.

## EARS Requirements

### REQ-001 — No removed mechanisms in shipped guidance (MH-01)
**Universal:** The shipped guidance shall not instruct an agent to hold or check a slice lock, read or write `.harness/progress/` records, edit a `PROGRESS.md` row by hand, maintain `dependency-graph.json` or `spike-results/`, or send heartbeats.

### REQ-002 — Stale-reference sensor (MH-01)
**Event-driven:** When `npm test` runs, the kit test suite shall fail and name the file and phrase if shipped guidance contains a phrase banned by REQ-001.

### REQ-003 — Park and abandon a slice (MH-02)
**Event-driven:** When the latest status-bearing `checkpoint` session of a slice carries `status: "PARKED"` or `status: "ABANDONED"`, `sync-state.mjs` shall write that status to the slice manifest and the registry.

### REQ-004 — Resume a slice (MH-02)
**Event-driven:** When a later `checkpoint` session carries `status: "in_progress"`, `sync-state.mjs` shall derive the slice status from its sessions again (`in_progress` or `DONE`).

### REQ-005 — Generated PROGRESS.md (MH-01)
**Event-driven:** When `sync-state.mjs` regenerates the registry, it shall rewrite `.harness/PROGRESS.md` as a table of every registry slice (slice, mode, phase, status, active features), and `init-slice.mjs` shall not edit `PROGRESS.md`.

### REQ-006 — No agent-defined cutoffs (MH-03)
**Universal:** The agent prompts in `.agents/agents/` shall not compare a score or a percentage against a number; where a cutoff applies they shall cite the `QG-*` rule in `quality-gates.md`.

### REQ-007 — Agent-cutoff sensor (MH-03)
**Event-driven:** When `npm test` runs, the kit test suite shall fail and name the file and line if an agent prompt compares a decimal score or a percentage against a number.

### REQ-008 — Command gate name (MH-04)
**Universal:** The harness shall run the command safety gate from `.harness/scripts/command-gate.mjs`, and the installer, hook configs, runtime recipes, the `jev-gate` MCP server, CI, and docs shall reference that path.

**Event-driven (upgrade, VAL-001):** When the installer merges a hook config that already has a gate entry calling `jev-command-gate.mjs`, it shall rewrite that entry to call `command-gate.mjs` and shall not add a second gate entry.

### REQ-009 — Old command-gate path keeps working (MH-04)
**Event-driven:** When a hook config still calls `.harness/scripts/jev-command-gate.mjs`, the shim at that path shall return the same verdict as `command-gate.mjs` for the same payload.

### REQ-010 — Always-loaded steering budget (MH-05)
**Conditional:** If the total size in bytes of the `inclusion: always` steering files plus `AGENTS.md` exceeds the `Always-loaded steering budget` recorded in the kit's `.harness/steering/quality-gates.project.md`, or that binding is unfilled, then the kit test suite shall fail and report the size and the budget.

### REQ-011 — Domain model stays in the kit (MH-06)
**Universal:** The installer shall seed a project's `docs/architecture/domain-model.md` from `scripts/templates/docs/domain-model.md`, and shall never copy the kit's own `docs/architecture/domain-model.md`.

### REQ-012 — No lock or progress scaffolding in new projects
**Event-driven:** When the installer scaffolds a new project, it shall not create `.harness/state/locks/` or `.harness/progress/`, and the generated `project.json` shall not declare `paths.locks` or `paths.progress`.

### REQ-013 — Smaller always-loaded steering
**Universal:** After this slice, the always-loaded steering plus `AGENTS.md` shall be smaller than 36,627 bytes.

## Priority Matrix
| ID | Priority | Status |
|----|----------|--------|
| REQ-001 | MUST | READY |
| REQ-002 | MUST | READY |
| REQ-003 | MUST | READY |
| REQ-004 | MUST | READY |
| REQ-005 | MUST | READY |
| REQ-006 | MUST | READY |
| REQ-007 | MUST | READY |
| REQ-008 | MUST | READY |
| REQ-009 | MUST | READY |
| REQ-010 | MUST | READY |
| REQ-011 | MUST | READY |
| REQ-012 | SHOULD | READY |
| REQ-013 | SHOULD | READY |

## Acceptance Criteria

### AC-001 — Stale phrase fails the suite (REQ-001, REQ-002)
**Given** a shipped guidance file containing "holds the slice lock"
**When** the stale-reference test runs
**Then** it fails and names that file and phrase; with the phrase removed it passes.

### AC-002 — Park, abandon, resume (REQ-003, REQ-004)
**Given** a slice with an `in_progress` feature
**When** a `checkpoint` session with `status: "PARKED"` is added and `sync-state.mjs` runs
**Then** the manifest and registry show `PARKED`; after a later `checkpoint` with `status: "in_progress"`, they show `in_progress`.

### AC-003 — ABANDONED is final until resumed (REQ-003)
**Given** a slice whose latest status checkpoint is `ABANDONED`
**When** a non-status session (for example `feature_started`) is added
**Then** the slice stays `ABANDONED`.

### AC-004 — PROGRESS.md is generated (REQ-005)
**Given** two slices in the registry
**When** `sync-state.mjs` runs
**Then** `PROGRESS.md` lists both rows with mode, phase, status, and active features, and `init-slice.mjs` output does not mention `PROGRESS.md`.

### AC-005 — Agent cutoff fails the suite (REQ-006, REQ-007)
**Given** an agent prompt containing "If `score < 0.75`"
**When** the agent-cutoff test runs
**Then** it fails naming the file and line; a range such as `[0.0–1.0]` or a latency target such as `p95 < 200ms` does not fail it.

### AC-006 — Command gate under both names (REQ-008, REQ-009)
**Given** a Claude `PreToolUse` payload for `git push --force` and one for `git status`
**When** each is sent to `command-gate.mjs` and to `jev-command-gate.mjs`
**Then** both scripts deny the first and allow the second with identical JSON.

**And given** an existing `.cursor/hooks.json` and `.claude/settings.json` whose gate entry calls `jev-command-gate.mjs`
**When** the installer runs again
**Then** each file has exactly one gate entry, and it calls `command-gate.mjs`.

### AC-007 — Budget (REQ-010, REQ-013)
**Given** the kit repository
**When** the budget test runs
**Then** it passes when the measured size is at or below the binding, fails when above, fails when the binding is unfilled, and the measured size is below 36,627 bytes.

### AC-008 — Installed project contents (REQ-011, REQ-012)
**Given** a fresh install into an empty directory
**When** the installer finishes
**Then** `docs/architecture/domain-model.md` equals the template stub, and neither `.harness/state/locks/`, `.harness/progress/`, `paths.locks`, nor `paths.progress` exists.

## Out of Scope
- Gate model and thresholds in `quality-gates.md`.
- Jev placement (`jev-module` slice).
- Skill scoring rubrics.
