# Design: jev-module

Design version: 1.0.0
Status: READY
Requirements version: 1.1 (REQ-014 added for VAL-001)
Domain model version: 1.1 (Module, Gate decision)
Design confidence score: 0.86
Uncertainty Factors: (1) the installer gains its first removal path; (2) upgrade detection order relative to `enable_modules`; (3) skills must keep one set of criteria for both branches.
Last updated: 2026-10-28
Owner: eencinas (Tech Lead)

## Traceability
- Requirements: [requirements.md](requirements.md)
- Validation: [spec-validation-report.md](spec-validation-report.md) (PASSED; INFO VAL-002, VAL-003)

## 1. Architecture Overview
Jev becomes an installer module named `jev`. Its source stays where it is (ADR-001); what changes is *when* the installer copies it. Core scripts drop their dead Jev dependency. The two Shape Up skills read `modules.jev` from `project.json` and branch between Jev gates and a human-decided checklist with the same criteria.

## What Changes

One owning task per file (SP-002).

| File/Module | Nature of Change | REQ | Task |
|-------------|------------------|-----|------|
| `scripts/test-install-into.sh`, `scripts/test-full-flow.sh` | Default / module / all / upgrade / remove / kit-only assertions (written first, red) | 001–007, 009, 010, 014 | TASK-001 |
| `.harness/scripts/check-invariants.mjs` | Drop the `jev-gates.mjs` import and the no-op call | 007 | TASK-002 |
| `.harness/scripts/check-project-config.mjs` | `capabilities.jev` optional; required when `modules.jev` is `true`; existing checks when present | 002, 006 | TASK-002 |
| `.harness/scripts/validators/jev-gold-plating.mjs` | Delete | 011 | TASK-002 |
| `scripts/install-into.sh` | Jev files, `jev.md`, MCP entry, and `capabilities.jev` move into `enable_one_module jev`; `all` and the picker include `jev`; `detect_installed_modules`; `--remove-modules=jev`; project.json template and upgrade patcher stop seeding Jev | 001, 003–005, 014 | TASK-003 |
| `.agents/mcp/mcp.json` | Remove the `jev-gate` entry from the baseline | 001 | TASK-003 |
| `.agents/modules/jev/mcp.json` (new) | The `jev-gate` entry, registered only by the module | 003 | TASK-003 |
| `scripts/generate-versions.mjs`, `.harness/config/versions.json` | Record the module fragment | 003 | TASK-003 |
| `.agents/skills/shape-up/SKILL.md`, `.agents/skills/product-delivery/SKILL.md` | Branch on `modules.jev` (ADR-003) | 008 | TASK-004 |
| `.harness/steering/jev.md` | `inclusion: auto` (tag `discovery`); "module" wording | 009 | TASK-004 |
| `AGENTS.md`, `.harness/steering/controls.md`, `.harness/steering/README.md`, `runtimes/cursor/asdd-steering.mdc`, `.agents/modules/README.md`, `.agents/mcp/README.md`, `README.md`, `.agents/mcp/jev-gate-server.mjs` (tool description) | Jev as optional module; command safety via the CLI; `check_command_safety` deprecated | 012 | TASK-005 |
| `.harness/steering/quality-gates.project.md` (kit binding) | Lower the always-loaded budget | 013 | TASK-006 |

## Domain Placement
- Owning domain: Distribution (installer, module mechanics) and Process (skills, steering).
- Integration boundaries: `project.json` (`modules`, `capabilities.jev`), `mcp.json` (merge, never overwrite), runtime MCP projections (`sync-runtime-mcp.cjs` runs after modules).
- Documented exceptions: none.

## Domain Impact
- New terms: Module, Gate decision (added in the Domain phase).

## Architecture Decisions (ADRs)
- **ADR-001: Source stays in place; the installer gates the copy.** Jev files keep their paths (`.harness/scripts/jev-*.mjs`, `.agents/mcp/jev-gate-server.mjs`, `.harness/steering/jev.md`) because the same path is used in the kit and in projects, and `jev-gate-server.mjs` imports `../../.harness/scripts/…`. Only the MCP entry needs a module-owned file (`.agents/modules/jev/mcp.json`), since the baseline `mcp.json` must not list it. `.agents/modules/README.md` documents the jev row with its source paths.
- **ADR-002: Detection, then explicit choice.** Before `enable_modules`, `detect_installed_modules` appends `jev` when the project has `jev-gates.mjs`, `modules.jev: true`, or `capabilities.jev.enabled: true`, unless `modules.jev` is `false`. `--remove-modules=jev` deletes the Jev surface, removes the MCP entry and `capabilities.jev`, and writes `modules.jev: false`; `--modules=jev` turns it back on. Removal runs before runtime wiring so MCP projections no longer list `jev-gate`.
- **ADR-003: One set of criteria, two deciders.** Each skill keeps its gate criteria in one place. A short "Gate mode" block says: with `modules.jev: true`, call the Jev tools and stop on `unavailable`; otherwise apply the same criteria as a checklist, ask the human, and record `decided_by` (Shape Up betting decision; Product Delivery EARS freeze and scope choice). Thresholds stay in `jev.md` (module).
- **ADR-004: `check_command_safety` stays in the module server, deprecated.** The CLI (`command-gate.mjs`) already serves hooks and runtimes without hooks; the tool remains for existing MCP users and says so in its description. No new server (kit review: less surface).
- **ADR-005: Core never imports Jev.** `check-invariants.mjs` loses its import; a test scans every `.mjs` of a default install for `jev-client.mjs` / `jev-gates.mjs` imports (the command-gate shim imports neither).

## Sequence Diagram
```
install (no flags, new)       → core only → modules.jev unset → no Jev surface
install --modules=jev         → enable_one_module jev → copy files, jev.md, register jev-gate, write capabilities.jev → modules.jev=true
install (upgrade, has Jev)    → detect_installed_modules → +jev → refresh as module
install --remove-modules=jev  → delete files, drop mcp entry + capabilities.jev → modules.jev=false → later runs skip detection
```

## Component Map
```
install-into.sh ── detect_installed_modules ──► MODULES
                ── enable_one_module jev ──► .harness/scripts/jev-*.mjs, .agents/mcp/jev-gate-server.mjs, jev.md
                                         └─► register_mcp_server jev-gate (from .agents/modules/jev/mcp.json)
                ── remove_one_module jev ──► rm + mcp.json/project.json edits
skills ── read project.json modules.jev ──► Jev tools | human checklist
```

## Risks and Mitigations
- An upgrade silently drops Jev for a team that uses it: detection keeps it unless the team explicitly removes it (AC-003).
- Removal deletes a file a team edited: only kit-managed Jev files are deleted, and the log lists each one.
- `--modules=all` now needs a key for the skills to pass their gates: stated next to the flag (VAL-002).

## Design Confidence Score
0.86
