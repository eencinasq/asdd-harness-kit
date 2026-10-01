# ASDD and Harness Engineering

**ASDD** answers *which pipeline phase* and *which spec artifact*.  
**Harness** answers *which code feature* is under test *now*, which files may change, and what evidence is required before the work is called done.

| Question | System | Artifact |
|----------|--------|----------|
| ASDD phase? | ASDD | `.harness/state/slices/<id>/manifest.json` |
| Which slices? | Harness index | `.harness/PROGRESS.md` + global `manifest.json` |
| Which TASK now? | Harness | `.harness/features/<id>.features.json` |
| Who may write? | Locks | `.harness/state/locks/<id>.lock` |
| Which product files? | Active spec | `.harness/specs/<slice>/intent.md` (Lite: `spec.md`) plus the paths that spec, `design.md`, `tasks.md`, and the in-progress `scope_paths` name |
| Which control wins? | Precedence | `.harness/steering/controls.md` |

Pipeline: Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge  
(+ optional Refactor, Bruno, and Playwright modules).

**ASDD-Lite:** Spec → Design → Tasks → Implementation → QA-Lite — see `.harness/steering/asdd-lite.md`. Lite skips CCS and the numeric quality gates. It still uses file scope, feature evidence, invariants, and session close.

Operational map: root [`AGENTS.md`](../AGENTS.md). The contracts live under [`.harness/steering/`](../.harness/steering/). This page explains how they fit. It does not replace them.

## Guides, then sensors

A guide steers the agent before it edits. A sensor checks the result and, on failure, comes back as the next prompt so the agent can correct it before the session ends. The index, the regulation each control owns, and the precedence order are in [`.harness/steering/controls.md`](../.harness/steering/controls.md).

| When | What runs | Contract |
|------|-----------|----------|
| Session start | Read `PROGRESS.md`, the slice manifest, features, and the steering for the phase, including `controls.md` | `AGENTS.md` |
| Before choosing a skill | The skills index exposes only each folder's name and description | `.harness/steering/skills.md` |
| When that task starts | Read `.agents/skills/<name>/SKILL.md`. Do not read `references/` until that body says to | `skills.md` |
| Before any product edit | Stay inside the files mapped to the active spec. Do not refactor unless the spec, the current task, or the slice phase `refactor` asks for it | `.harness/steering/session-loop.md` |
| At a phase gate | Apply the EARS criteria. CCS below 0.50 blocks, 0.50 through 0.65 warns, and above 0.65 passes. No agent prompt adds a second cutoff | `.harness/steering/quality-gates.md` |
| Before `passing` or session end | `node .harness/scripts/check-invariants.mjs` must exit 0. WARN does not block. FAIL does | `session-loop.md` |
| Cursor stop | `.cursor/hooks.json` runs `node .harness/scripts/verify-on-stop.mjs`. A failing check is submitted as the next user message (`loop_limit` 3). Abort and error statuses do not continue the loop | `.cursor/hooks.json` |
| Pull request | `.github/workflows/harness-invariants.yml` repeats the same invariants check | CI |
| Before a new spec enters Task Planning | The full-suite command in `quality-gates.project.md` must report zero failures | `QG-DEB-*` |
| Same failure logged three times | Record which guide or sensor must change. Do not close it as an observation only | `QG-DEB-06` |

Fast checks stay at session stop. The more expensive suite stays on the Task Planning gate. CI repeats the invariants check after integration.

## What "done" means

A feature is `passing` only when its `verification` command has been run and the `evidence` field records that result, and the left sensors for the session exit 0. A written summary is not evidence.

Session close, before the lock is deleted:

1. Invariants exit 0.
2. No feature is `passing` without evidence.
3. The diff contains only mapped product files and the harness records the session loop allows (per-slice manifest, features, progress, lock, and the `PROGRESS.md` row).
4. The lock is removed on handoff.
5. The `PROGRESS.md` row matches the per-slice manifest.

## Project binding

`quality-gates.project.md` is a stub until Discovery. An unfilled test command, failure-log path, or `Active findings: unfilled` blocks the gate that needs it. The agent does not invent a substitute. Example finding rows are inactive. Set `Active findings: none` or replace them with this project's rows.

After a module copies a skill into `.agents/skills/`, regenerate the catalog with `node .harness/scripts/check-skills-index.mjs --write`. The installer does this. `check-invariants.mjs` fails if the catalog drifts from the installed folders.
