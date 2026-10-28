# Tasks: jev-module

## Traceability
- Design: [design.md](design.md)
- Requirements: [requirements.md](requirements.md)

Serial, one owner. **One owning task per file** (applies SP-002): no file appears under two tasks' `Files affected`. Later tasks verify with tests owned by TASK-001 without editing them.

## Wave 1 — tests first

### TASK-001 — Install tests for default, module, all, upgrade, remove, kit-only
- **Description:** Replace the "Jev on every install" assertions with: default install has no Jev surface and passes config and invariant checks, no default `.mjs` imports Jev code; `--modules=jev` and `--modules=all` install it with the stated `capabilities.jev`; an upgrade of a pre-module Jev install keeps it; `--remove-modules=jev` removes it and a re-run does not bring it back; this slice's artifacts never land in a project or the npm package. `test-full-flow.sh` installs with `--modules=jev`. Expected red until TASK-002/003.
- **Files affected:** `scripts/test-install-into.sh`, `scripts/test-full-flow.sh`
- **Verification:** `bash -n scripts/test-install-into.sh && bash -n scripts/test-full-flow.sh`
- **REQ trace:** REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-007, REQ-009, REQ-010, REQ-014

## Wave 2 — make them green

### TASK-002 — Core harness without Jev
- **Description:** Remove the Jev import from `check-invariants.mjs`; make `capabilities.jev` optional in `check-project-config.mjs` (required when `modules.jev` is true, existing checks when present); delete the no-op `jev-gold-plating.mjs`.
- **Files affected:** `.harness/scripts/check-invariants.mjs`, `.harness/scripts/check-project-config.mjs`, `.harness/scripts/validators/jev-gold-plating.mjs`
- **Verification:** `bash scripts/test-lifecycle.sh`
- **REQ trace:** REQ-002, REQ-006, REQ-007, REQ-011

### TASK-003 — Installer: Jev as a module
- **Description:** Move the Jev copies, `jev.md`, MCP entry, and `capabilities.jev` into `enable_one_module jev`; include `jev` in `all` and the picker; add `detect_installed_modules` and `--remove-modules=jev`; stop seeding Jev in the project.json template and upgrade patcher; move the `jev-gate` MCP entry to `.agents/modules/jev/mcp.json`; record it in versions.
- **Files affected:** `scripts/install-into.sh`, `.agents/mcp/mcp.json`, `.agents/modules/jev/mcp.json`, `scripts/generate-versions.mjs`, `.harness/config/versions.json`
- **Verification:** `bash scripts/test-install-into.sh`
- **REQ trace:** REQ-001, REQ-003, REQ-004, REQ-005, REQ-014

### TASK-004 — Skills and Jev steering work with or without the module
- **Description:** Add a "Gate mode" block to `shape-up` and `product-delivery` (Jev tools with the module; same criteria as a human checklist with `decided_by` without it); make `jev.md` `inclusion: auto` and describe it as the module's steering.
- **Files affected:** `.agents/skills/shape-up/SKILL.md`, `.agents/skills/product-delivery/SKILL.md`, `.harness/steering/jev.md`
- **Verification:** `bash scripts/test-install-into.sh`
- **REQ trace:** REQ-008, REQ-009

### TASK-005 — Guidance and docs: Jev is optional
- **Description:** Update `AGENTS.md`, `controls.md`, the steering README, the Cursor rule, the modules and MCP READMEs, the kit README, and the `check_command_safety` description (deprecated; use the CLI).
- **Files affected:** `AGENTS.md`, `.harness/steering/controls.md`, `.harness/steering/README.md`, `runtimes/cursor/asdd-steering.mdc`, `.agents/modules/README.md`, `.agents/mcp/README.md`, `README.md`, `.agents/mcp/jev-gate-server.mjs`
- **Verification:** `node scripts/check-guidance.mjs --only stale,cutoffs . && bash scripts/test-install-into.sh`
- **REQ trace:** REQ-012

## Wave 3

### TASK-006 — Lower the always-loaded budget
- **Description:** Set `Always-loaded steering budget` to the installed size measured by `test-install-into.sh` after `jev.md` leaves the always-loaded set.
- **Files affected:** `.harness/steering/quality-gates.project.md`
- **Verification:** `bash scripts/test-install-into.sh`
- **REQ trace:** REQ-013

## Task Planning Confidence Score
0.86 — uncertainty: TASK-003 is the largest installer change so far; skills wording in TASK-004.
