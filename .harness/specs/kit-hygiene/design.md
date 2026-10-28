# Design: kit-hygiene

Design version: 1.0.0
Status: READY
Requirements version: 1.1 (REQ-008 amended for VAL-001)
Domain model version: 1.0 (seeded in this slice)
Design confidence score: 0.87
Uncertainty Factors: (1) the shim must keep hook verdicts byte-identical; (2) the banned-phrase list must not flag legitimate text; (3) the budget value is set after trimming.
Last updated: 2026-10-28
Owner: eencinas (Tech Lead)

## Traceability
- Requirements: [requirements.md](requirements.md)
- Validation: [spec-validation-report.md](spec-validation-report.md) (PASSED; INFO VAL-002 … VAL-004)

## 1. Architecture Overview
Two kinds of change. **Behavior** in the harness scripts (`sync-state.mjs` statuses and `PROGRESS.md`, `init-slice.mjs`, the command gate and its shim, the installer). **Guidance** text in shipped Markdown. A new kit-only sensor, `scripts/check-guidance.mjs`, checks what actually ships: it runs against an installed project in `test-install-into.sh`, so it sees the same files an adopter gets, including text the installer generates (`CLAUDE.md`).

## What Changes

| File/Module | Nature of Change | REQ |
|-------------|------------------|-----|
| `.harness/scripts/sync-state.mjs` | `deriveStatus` honours checkpoint `status` (PARKED/ABANDONED/in_progress); write `PROGRESS.md` from the registry; drop the stale header line | 003, 004, 005 |
| `.harness/scripts/init-slice.mjs` | Stop editing `PROGRESS.md` (sync-state regenerates it) | 005 |
| `.harness/scripts/command-gate.mjs` (new, from `jev-command-gate.mjs`) | The gate; exports `runHookCli()` | 008 |
| `.harness/scripts/jev-command-gate.mjs` | Deprecated shim: re-exports the library API and calls `runHookCli()` | 009 |
| `.harness/scripts/jev-command-gate.test.mjs` → `command-gate.test.mjs` | Tests for both names (AC-006) | 008, 009 |
| `.agents/mcp/jev-gate-server.mjs` | Import from `command-gate.mjs` | 008 |
| `scripts/install-into.sh` | Install both gate files; hook merge rewrites old entries, never duplicates; domain-model stub from `scripts/templates/docs/`; no `locks`/`progress` dirs or paths; fix generated `CLAUDE.md` text | 008, 011, 012 |
| `.cursor/hooks.json`, `runtimes/**` | New gate path | 008 |
| `.harness/scripts/check-project-config.mjs`, `.harness/config/project.schema.json` | `progress`, `locks` no longer required | 012 |
| `.harness/scripts/validators/locks.mjs`, `.harness/state/locks/README.md` | Delete (dead) | 001, 012 |
| `scripts/check-guidance.mjs` (new, kit-only) | `stale`, `cutoffs`, `budget` checks over a directory | 002, 007, 010 |
| `scripts/check-guidance.test.mjs` (new, kit-only) | Fixtures for AC-001, AC-005, AC-007 | 002, 007, 010 |
| `scripts/test-install-into.sh` | Run `check-guidance.mjs` on the installed project; AC-006 upgrade check; AC-008 | 002, 007, 008–012 |
| `.harness/steering/quality-gates.project.md` (kit binding) | `Always-loaded steering budget` slot | 010 |
| Shipped guidance: `AGENTS.md`, `session-loop.md`, `manifest.md`, `controls.md`, `structure` stub, agents (implementation, lite, discovery, knowledge, refactor, domain, design, validation, task-planning, spec, QA), `open-code-review` skill | Remove stale mechanisms; replace cutoffs with `QG-*` citations; document PARKED/ABANDONED checkpoints and generated `PROGRESS.md` | 001, 006, 013 |
| `README.md`, `.agents/mcp/README.md`, `.github/workflows/harness-invariants.yml`, `package.json`, `scripts/generate-versions.mjs` | New gate name, new test files | 008 |

## Domain Placement
- Owning domain: Process (shipped) for statuses, gate, guidance; Distribution (kit-only) for `check-guidance.mjs`, budget binding, installer.
- Integration boundaries: hook configs (project-owned, merged), `installed-versions.json` (upgrade).
- Documented exceptions: none.

## Domain Impact
- New terms added to Ubiquitous Language: none beyond the Domain phase seed (Always-loaded steering, Guidance document already defined).

## Architecture Decisions (ADRs)
- **ADR-001: `PROGRESS.md` is generated.** `sync-state.mjs` rewrites it from the registry on every full or partial sync. Rationale: one owner, no hand-edited rows, and `controls.md` session-close item becomes true by construction. Consequence: hand edits are overwritten (VAL-002) — documented in `session-loop.md`.
- **ADR-002: Status comes from a checkpoint `status` field.** The latest checkpoint carrying `status` wins: `PARKED`/`ABANDONED` override derivation; `in_progress` hands derivation back to sessions (resume). Rationale: reuses the existing `checkpoint` event and the existing manifest validator, which already accepts these statuses. Consequence: no new event type.
- **ADR-003: Rename with a shim, rewrite on upgrade.** `command-gate.mjs` holds the code; `jev-command-gate.mjs` re-exports it and runs its CLI. The installer rewrites `jev-command-gate.mjs` → `command-gate.mjs` inside existing gate entries before its "already present" check. Rationale: verdicts stay identical for un-upgraded hooks, and upgraded projects stop depending on the shim so it can be removed in a later major version.
- **ADR-004: The guidance sensor checks the installed result.** `check-guidance.mjs <dir>` scans an installed project (`test-install-into.sh` already builds one with every runtime and module). Rationale: shipped guidance is defined by what the installer writes, including generated files. Consequence: line numbers point into the installed copy; the message also prints the relative path, which matches the kit source path for copied files.
- **ADR-005: Budget in bytes, from the kit binding.** `Always-loaded steering budget` in the kit's `quality-gates.project.md`; an unfilled slot fails (unconfigured is not a pass). Set after trimming, below 36,627 (REQ-013).
- **ADR-006: Cutoff detection rule.** Flag a comparison operator (`<`, `>`, `≤`, `≥`, `<=`, `>=`) followed by a decimal in `[0,1]` (`0.75`, `.9`) or a percentage, and phrases "raised to 0.x" / "reduces confidence by 0.x". Ranges like `[0.0–1.0]` and units like `200ms` are not flagged.

## Sequence Diagram
```
Hook (old config) → jev-command-gate.mjs (shim) → command-gate.mjs:runHookCli() → verdict JSON
Installer (upgrade) → hooks.json: rewrite "jev-command-gate.mjs" → "command-gate.mjs" → skip add (present)
Session checkpoint {status: PARKED} → sync-state → manifest.status = PARKED → registry → PROGRESS.md
test-install-into.sh → install → check-guidance.mjs <target> (stale, cutoffs, budget) → exit code
```

## Component Map
```
sync-state.mjs ──► manifest.json ──► registry.json ──► PROGRESS.md
command-gate.mjs ◄── jev-command-gate.mjs (shim) ◄── old hook configs
                 ◄── jev-gate-server.mjs, new hook configs
check-guidance.mjs ◄── test-install-into.sh (installed project) ◄── quality-gates.project.md (budget)
```

## Risks and Mitigations
- Shim changes a verdict: AC-006 compares the JSON of both scripts byte for byte.
- Banned phrases flag legitimate history ("the v2 lock protocol was removed"): remove such history lines from shipped guidance instead of allow-listing; history belongs in the changelog.
- Existing projects have `paths.progress`/`paths.locks`: making them optional keeps old `project.json` valid.
- Regenerated `PROGRESS.md` surprises a team that edited it: `session-loop.md` states it is generated.

## Design Confidence Score
0.87
