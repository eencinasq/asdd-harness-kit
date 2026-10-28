# Requirements: jev-module

## Traceability
- Capability: [capability.md](capability.md)
- Intent: [intent.md](intent.md) (MH-01 … MH-06)
- Slice: jev-module

**Jev surface** (term used below): `.harness/scripts/jev-client.mjs`, `.harness/scripts/jev-gates.mjs`, `.agents/mcp/jev-gate-server.mjs`, `.harness/steering/jev.md`, the `jev-gate` entry in `.agents/mcp/mcp.json`, and `capabilities.jev` in `.harness/config/project.json`. The command-gate shim `jev-command-gate.mjs` is not part of it (kit-hygiene REQ-009).

## EARS Requirements

### REQ-001 — Default install has no Jev (MH-01)
**Event-driven:** When the installer runs without the `jev` module, it shall not write any file or entry of the Jev surface into the project.

### REQ-002 — Default install passes its checks (MH-01)
**Event-driven:** When a project installed without the `jev` module runs `check-project-config.mjs` and `check-invariants.mjs`, both shall exit 0 without a `capabilities.jev` block.

### REQ-003 — Jev module install (MH-02)
**Event-driven:** When the installer runs with `--modules=jev`, it shall install the Jev surface, write `capabilities.jev` with `enabled: true`, `required: false`, `required_by: ["shape-up", "product-delivery"]`, and an empty `apiKey`, and record `modules.jev: true`.

### REQ-004 — `--modules=all` includes Jev (MH-02)
**Event-driven:** When the installer runs with `--modules=all`, it shall enable `jev` with the other modules.

### REQ-005 — Upgrade keeps Jev (MH-04)
**Event-driven:** When the installer runs on a project that has `.harness/scripts/jev-gates.mjs`, `modules.jev: true`, or `capabilities.jev.enabled: true`, it shall enable the `jev` module without a flag; on a project with none of these, or with `modules.jev: false`, it shall not enable it (an explicit off wins over detection, VAL-001).

### REQ-014 — Remove the module (MH-01, MH-04, VAL-001)
**Event-driven:** When the installer runs with `--remove-modules=jev`, it shall delete the Jev surface files, remove the `jev-gate` entry from `mcp.json` and `capabilities.jev` from `project.json`, and record `modules.jev: false`; later runs shall not re-enable it unless `--modules=jev` is passed.

### REQ-006 — Config check follows the module (MH-01, MH-02)
**Conditional:** If `modules.jev` is `true` and `capabilities.jev` is missing, then `check-project-config.mjs` shall fail; if `capabilities.jev` is present, it shall apply the existing Jev checks (empty `apiKey`, endpoint when enabled, `required_by` shape); otherwise it shall not require Jev.

### REQ-007 — Core imports no Jev code (MH-05)
**Universal:** The scripts installed without the `jev` module shall not import `jev-client.mjs` or `jev-gates.mjs`.

### REQ-008 — Skills work with and without Jev (MH-03)
**State-driven:** While `modules.jev` is `true`, the `shape-up` and `product-delivery` skills shall require their Jev gates and shall not treat `unavailable` as a pass; while it is not `true`, they shall apply the same criteria as a checklist and shall record the human who decided.

### REQ-009 — Jev steering is not always loaded (MH-01)
**Universal:** `.harness/steering/jev.md` shall be `inclusion: auto` and shall be installed only with the `jev` module.

### REQ-010 — Slice artifacts stay in the kit (MH-06)
**Universal:** The installer shall not copy, and the npm package shall not contain, this slice's specs, features, or sessions.

### REQ-011 — Dead Jev validator removed
**Universal:** The kit shall not ship `.harness/scripts/validators/jev-gold-plating.mjs`.

### REQ-012 — Command safety without Jev
**Universal:** Core guidance shall point to the `command-gate.mjs` CLI for command safety; the `check_command_safety` tool of the `jev-gate` server shall be documented as deprecated.

### REQ-013 — Smaller always-loaded steering
**Universal:** The always-loaded steering budget shall be lowered to the measured size after `jev.md` leaves it.

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
| REQ-011 | SHOULD | READY |
| REQ-012 | SHOULD | READY |
| REQ-013 | SHOULD | READY |
| REQ-014 | MUST | READY |

## Acceptance Criteria

### AC-001 — Default install (REQ-001, REQ-002, REQ-007, REQ-009)
**Given** an empty directory
**When** the installer runs with `--runtime=cursor,claude` and no modules
**Then** no Jev-surface file or entry exists, no installed `.mjs` imports `jev-client.mjs` or `jev-gates.mjs`, and `check-project-config.mjs` and `check-invariants.mjs` exit 0.

### AC-002 — Module install (REQ-003, REQ-004, REQ-009)
**Given** an empty directory
**When** the installer runs with `--modules=jev` (and, separately, `--modules=all`)
**Then** the Jev surface exists, `jev.md` is `inclusion: auto`, `capabilities.jev` has the stated values, and `modules.jev` is `true`.

### AC-003 — Upgrade (REQ-005)
**Given** a project with Jev installed by the previous kit version (has `.harness/scripts/jev-gates.mjs`)
**When** the installer runs again without `--modules`
**Then** `modules.jev` is `true` and the Jev surface is refreshed; **and given** a default install, a re-run leaves `modules.jev` unset.

### AC-007 — Remove the module (REQ-014, REQ-005)
**Given** a project with the `jev` module enabled
**When** the installer runs with `--remove-modules=jev`, then again with no flags
**Then** the Jev surface is gone, `modules.jev` is `false`, `check-project-config.mjs` passes, and the second run does not bring Jev back.

### AC-004 — Config check (REQ-006)
**Given** `modules.jev: true` without `capabilities.jev`
**When** `check-project-config.mjs` runs
**Then** it fails; with neither, it passes; with `capabilities.jev.apiKey` set, it fails.

### AC-005 — Skills (REQ-008)
**Given** the installed `shape-up` and `product-delivery` skills
**When** an agent reads them
**Then** each names the `modules.jev` condition, keeps "unavailable is not a pass" for the module branch, and records a human `decided_by` for the checklist branch.

### AC-006 — Kit-only artifacts (REQ-010)
**Given** this slice's directories in the kit
**When** the installer runs and the npm package is packed
**Then** neither contains `.harness/specs/jev-module/`, `.harness/features/jev-module.features.json`, or `.harness/state/slices/jev-module/`.

## Out of Scope
- Jev thresholds and client behavior.
- Removing the `jev-command-gate.mjs` shim.
- A new MCP server for command safety.
