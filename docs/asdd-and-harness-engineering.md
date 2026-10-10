# ASDD and Harness Engineering

**ASDD** answers *which pipeline phase* and *which spec artifact*.  
**Harness** answers *which code feature* is under test *now*, which files may change, and what evidence is required before the work is called done.

| Question | System | Artifact |
|----------|--------|----------|
| ASDD phase? | ASDD | `.harness/state/slices/<id>/manifest.json` |
| Which slices? | Harness index | `.harness/PROGRESS.md` + global `manifest.json` |
| Which TASK now? | Harness | `.harness/features/<id>.features.json` |
| Who may write? | Feature scopes | `owner` + disjoint `scope_paths` on in-progress features |
| Which product files? | Active spec | `.harness/specs/<slice>/intent.md` (Lite: `spec.md`) plus the paths that spec, `design.md`, `tasks.md`, and the in-progress `scope_paths` name |
| Which control wins? | Precedence | `.harness/steering/controls.md` |

Pipeline: Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge  
(+ optional Refactor, Bruno, and Playwright modules).

**Slices are Lite-first:** every slice starts in `lite` mode (Spec → Design → Tasks → Implementation → QA-Lite — see `.harness/steering/asdd-lite.md`). `full` is opt-in (`init-slice.mjs --full`) for known cross-cutting/architectural work. Lite skips CCS and the numeric quality gates. It still uses file scope, feature evidence, invariants, required Jev, and session close — and it is **serial** (one `in_progress` feature, machine-enforced). Growth evidence (scope spread, domain growth, dissent, implementation blockage) raises escalation signals that block `DONE` until the slice is escalated with `escalate-slice.mjs`.

Operational map: root [`AGENTS.md`](../AGENTS.md). The contracts live under [`.harness/steering/`](../.harness/steering/). This page explains how they fit. It does not replace them.

## Guides, then sensors

A guide steers the agent before it edits. A sensor checks the result and, on failure, comes back as the next prompt so the agent can correct it before the session ends. The index, the regulation each control owns, and the precedence order are in [`.harness/steering/controls.md`](../.harness/steering/controls.md).

| When | What runs | Contract |
|------|-----------|----------|
| Session start | Read `PROGRESS.md`, the slice manifest, features, and the steering for the phase, including `controls.md` | `AGENTS.md` |
| Before choosing a skill | The skills index exposes only each folder's name and description | `.harness/steering/skills.md` |
| When that task starts | Read `.agents/skills/<name>/SKILL.md`. Do not read `references/` until that body says to | `skills.md` |
| Before any product edit | Stay inside the files mapped to the active spec. Do not refactor unless the spec, the current task, or the slice phase `refactor` asks for it | `.harness/steering/session-loop.md` |
| At a full-ASDD phase gate | Apply EARS / coverage criteria in `quality-gates.md`. Lite skips those numeric gates | `.harness/steering/quality-gates.md` |
| Before Shape Up bet or EARS freeze | `jev-gates.mjs` (appetite, rabbit hole, EARS, slice) | `.harness/steering/jev.md` |
| Dangerous bash | `jev-command-gate.mjs` whitelist then Jev noul — hook-wired on Cursor (`beforeShellExecution`) and Claude Code (`PreToolUse`), both fail-closed; advisory elsewhere | `.harness/scripts/jev-command-gate.mjs` |
| In-progress diff vs spec | Jev gold-plating noul (WARN under 0.85; FAIL if Jev unavailable while a key is set) | `validators/jev-gold-plating.mjs` |
| Lite slice governance | Serial rule (one `in_progress`, FAIL) + escalation signals block `DONE` while open (`validators/lite-escalation.mjs`, `sync-state.mjs`) | `.harness/steering/asdd-lite.md` |
| Before `passing` or session end | `node .harness/scripts/check-invariants.mjs` must exit 0. WARN does not block. FAIL does | `session-loop.md` |
| Session end gate | Cursor stop hook and Claude Code Stop hook run `verify-on-stop.mjs` → `check-invariants.mjs --live`; a failing check (including a missing `JEV_API_KEY`) is returned as the next prompt (Cursor `loop_limit` 3; Claude respects `stop_hook_active`). Abort and error statuses do not continue the loop | `.cursor/hooks.json`, `.claude/settings.json` |
| Pull request | `.github/workflows/harness-invariants.yml` runs unit tests, installer smoke, lifecycle e2e with negative cases, config/skills checks, and `sync-state` + invariants | CI |
| Before a new spec enters Task Planning | The full-suite command in `quality-gates.project.md` must report zero failures | `QG-DEB-*` |
| Same failure logged three times | Record which guide or sensor must change. Do not close it as an observation only | `QG-DEB-06` |

Fast checks stay at session stop. The more expensive suite stays on the Task Planning gate. CI repeats the invariants check after integration.

## What "done" means

A feature is `passing` only when its `verification` command has been run and the `evidence` field records that result, and the left sensors for the session exit 0. A written summary is not evidence.

Session close:

1. Invariants exit 0 in live mode (`capabilities.jev.enabled` and `required` true, `JEV_API_KEY` set).
2. No feature is `passing` without evidence.
3. The diff contains only mapped product files and the harness records the session loop allows (sessions, features, `PROGRESS.md` row).
4. The `PROGRESS.md` row matches the per-slice manifest.
5. Lite slices closing with open escalation signals are rejected — escalate first (`escalate-slice.mjs`).

## Project binding

`quality-gates.project.md` is a stub until Discovery. An unfilled test command, failure-log path, or `Active findings: unfilled` blocks the gate that needs it. The agent does not invent a substitute. Example finding rows are inactive. Set `Active findings: none` or replace them with this project's rows.

After a module copies a skill into `.agents/skills/`, regenerate the catalog with `node .harness/scripts/check-skills-index.mjs --write`. The installer does this. `check-invariants.mjs` fails if the catalog drifts from the installed folders.

Jev is required. Set `JEV_API_KEY`; leave `capabilities.jev.apiKey` empty. See [jev-integration.md](jev-integration.md).
