# Tasks: kit-hygiene

## Traceability
- Design: [design.md](design.md)
- Requirements: [requirements.md](requirements.md)

Serial execution (one owner, one `in_progress` feature). Each task ends with its verification green, a commit, and `evidence_commit`.

## Wave 1 — sensors first

### TASK-001 — Guidance sensor and reliable shell assertions
- **Description:** Add kit-only `scripts/check-guidance.mjs <dir>` with `stale` (REQ-001 phrases), `cutoffs` (ADR-006), and `budget` (binding `Always-loaded steering budget`) checks, plus `scripts/check-guidance.test.mjs` fixtures for AC-001, AC-005, AC-007. Run it on the installed project in `test-install-into.sh`. Rewrite the three bare `!` assertions (`test-install-into.sh` ×2, `test-lifecycle.sh` ×1) so they fail under `set -e`, and make `check-guidance` reject bare `!` assertions in kit test scripts. Expected: the new run fails on today's guidance (red) until TASK-003/004/007.
- **Files affected:** `scripts/check-guidance.mjs`, `scripts/check-guidance.test.mjs`, `scripts/test-install-into.sh`, `scripts/test-lifecycle.sh`, `package.json`, `.harness/steering/quality-gates.project.md`
- **Verification:** `node --test scripts/check-guidance.test.mjs`
- **REQ trace:** REQ-002, REQ-007, REQ-010

### TASK-002 — Slice statuses and generated PROGRESS.md
- **Description:** `deriveStatus` honours the latest checkpoint `status` (ADR-002); `sync-state.mjs` writes `PROGRESS.md` from the registry (ADR-001); `init-slice.mjs` stops editing it.
- **Files affected:** `.harness/scripts/sync-state.mjs`, `.harness/scripts/sync-state.test.mjs`, `.harness/scripts/init-slice.mjs`
- **Verification:** `node --test .harness/scripts/sync-state.test.mjs`
- **REQ trace:** REQ-003, REQ-004, REQ-005

## Wave 2 — make the sensors green

### TASK-003 — Remove stale mechanisms from shipped guidance and scaffolding
- **Description:** Remove lock, progress-record, hand-edited `PROGRESS.md`, `dependency-graph.json`, `spike-results`, and heartbeat instructions from shipped guidance; document PARKED/ABANDONED checkpoints and the generated `PROGRESS.md`; stop scaffolding `.harness/state/locks/` and `.harness/progress/`; make `paths.progress`/`paths.locks` optional; delete `validators/locks.mjs` and `.harness/state/locks/README.md`; fix the installer-generated `CLAUDE.md` text.
- **Files affected:** `AGENTS.md`, `.harness/steering/session-loop.md`, `.harness/steering/manifest.md`, `.harness/steering/controls.md`, `.agents/agents/asdd-implementation-agent.md`, `.agents/agents/asdd-lite-agent.md`, `.agents/agents/asdd-discovery-agent.md`, `.agents/agents/asdd-knowledge-agent.md`, `.agents/agents/_runtime-template.md`, `.agents/skills/open-code-review/SKILL.md`, `scripts/templates/bindings/structure.md`, `scripts/install-into.sh`, `.harness/scripts/check-project-config.mjs`, `.harness/config/project.schema.json`, `.harness/scripts/validators/locks.mjs`, `.harness/state/locks/README.md`
- **Verification:** `bash scripts/test-install-into.sh` (stale check green)
- **REQ trace:** REQ-001, REQ-012

### TASK-004 — Agent prompts cite gate rules instead of numbers
- **Description:** Replace every numeric cutoff in `.agents/agents/` with the `QG-*` rule it belongs to, or delete it when no gate defines it (refactor 0.75/0.90, validation shortcut and dynamic target, design/implementation raised targets, task-planning restatement, discovery/spec deductions, QA restatement and "catch 90%").
- **Files affected:** `.agents/agents/asdd-refactor-agent.md`, `.agents/agents/asdd-domain-agent.md`, `.agents/agents/asdd-task-planning-agent.md`, `.agents/agents/asdd-design-agent.md`, `.agents/agents/asdd-discovery-agent.md`, `.agents/agents/asdd-spec-agent.md`, `.agents/agents/asdd-validation-agent.md`, `.agents/agents/asdd-implementation-agent.md`, `.agents/agents/asdd-qa-agent.md`
- **Verification:** `node scripts/check-guidance.mjs --only cutoffs .`
- **REQ trace:** REQ-006

### TASK-005 — Command gate rename with shim and upgrade rewrite
- **Description:** Move the gate to `command-gate.mjs` exporting `runHookCli()`; keep `jev-command-gate.mjs` as a shim; installer installs both and rewrites old hook entries without duplicates; update hooks, runtime recipes, MCP server, CI, docs, versions.
- **Files affected:** `.harness/scripts/command-gate.mjs`, `.harness/scripts/jev-command-gate.mjs`, `.harness/scripts/command-gate.test.mjs`, `.harness/scripts/jev-command-gate.test.mjs`, `.agents/mcp/jev-gate-server.mjs`, `.agents/mcp/README.md`, `scripts/install-into.sh`, `scripts/test-install-into.sh`, `.cursor/hooks.json`, `runtimes/**`, `.github/workflows/harness-invariants.yml`, `package.json`, `scripts/generate-versions.mjs`, `README.md`, `.harness/steering/controls.md`, `.agents/agents/asdd-implementation-agent.md`
- **Verification:** `node --test .harness/scripts/command-gate.test.mjs && bash scripts/test-install-into.sh`
- **REQ trace:** REQ-008, REQ-009

### TASK-006 — Domain model stays in the kit
- **Description:** Installer seeds `docs/architecture/domain-model.md` from `scripts/templates/docs/domain-model.md`; move the staged kit model from `.harness/specs/kit-hygiene/domain-model.md` to `docs/architecture/domain-model.md`; versions record the template.
- **Files affected:** `scripts/install-into.sh`, `scripts/generate-versions.mjs`, `scripts/templates/docs/domain-model.md`, `docs/architecture/domain-model.md`, `.harness/specs/kit-hygiene/domain-model.md`, `scripts/test-install-into.sh`
- **Verification:** `bash scripts/test-install-into.sh`
- **REQ trace:** REQ-011

## Wave 3

### TASK-007 — Trim always-loaded steering and set the budget
- **Description:** Trim history and duplicated text from `inclusion: always` steering; set `Always-loaded steering budget` to the measured size (below 36,627 bytes).
- **Files affected:** `.harness/steering/session-loop.md`, `.harness/steering/manifest.md`, `.harness/steering/controls.md`, `.harness/steering/README.md`, `.harness/steering/quality-gates.project.md`
- **Verification:** `node scripts/check-guidance.mjs --only budget .`
- **REQ trace:** REQ-010, REQ-013

## Task Planning Confidence Score
0.86 — uncertainty: TASK-003 touches many files; TASK-005 depends on the hook merge code in the installer.
