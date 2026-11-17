# Lessons: telemetry-emitters

**Author:** asdd-knowledge-agent
**Model/Tool:** claude-opus-5-5
**Date:** 2026-11-17

Full-mode slice (2026-11-16..17) on `feat/telemetry-emitters`, a worktree stacked on `chore/p5-roadmap-runtimes-bindings` (fork point `c337df7`), not on `main`. Kept in the slice directory, like `jev-module` and `kit-hygiene`. `docs/knowledge-base/` is shared and outside this slice's mapped files, so writing there would raise DRIFT-01.

Sources: sessions 001-080 under `.harness/state/slices/telemetry-emitters/sessions/`, commits `1b1fbae..d4f1386`, `spec-coverage-report.md`, SP-007 and SP-008.

## Outcome

- Five emitters write spans through one fail-open `telemetry-lib.mjs`: the command gate, Verify-on-Stop, `asdd sync`, `asdd observe`, and the WARN-only telemetry validator in `asdd check`. A read-only `asdd profile` report reads them (TASK-001..014).
- QA passed on run 3 at `21ea57e` against requirements 1.1.1 (session 079): MUST 25/25, EARS 129/129, `npm test` 374/374. The Tech Lead signed off in session 080.
- Two QA BLOCKs came before the pass (sessions 064 and 076). Both were real gaps and both were fixed by reopening a task.

## What the harness caught

| Caught by | What | Follow-up |
|---|---|---|
| QA probe (session 064) | UNCOV-001: `telemetry-observe.mjs` imported `telemetry-lib` statically, so a broken lib made `asdd observe` exit 1 (REQ-002 c7). No test covered it. | TASK-010 reopened with a guarded import (`c289a66`) |
| QA probe after the errata (session 076) | UNCOV-002: errata 1.1.1 (D-3) changed REQ-021 c4 to "unknown", but `asdd profile` still said Cursor was "not observed", and a test pinned that old behavior | TASK-013 reopened (`21ea57e`). QA-F-008 added superseded notes to design §6 and §12 |
| QA (session 064) | QA-F-003: the command gate exits 1 when its own module fails to load, which Claude Code treats as non-blocking. This was there before the slice. | Moved to a follow-up slice together with KPI-1 (session 075) |
| A reopen RED test (session 039) | The TASK-005 gate test wrote 43 gate-deny learning signals into the repo on every run, because `recordDenial()` used `process.cwd()` and ignored the `runHook` root seam | Fixed in `af3cdb3`. Evidence re-stamped in `b7deb4b` |
| DRIFT-02 (sessions 019, 042-050, 056-059, 063, 068) | Edits to shared files (`telemetry-lib.mjs`, its test, and the vendored `tools/jev-gate` copy) reopened passing features again and again | Each feature was re-verified. See lesson 2 |

## Lessons

1. **DRIFT-01 on a worktree stacked on a non-main base fails every Stop hook.** DRIFT-01 diffs against `main` by default. On this branch it flagged files that came in from the stacked base, so every Verify-on-Stop failed for the whole slice. The runtime spawns the Stop hook, so an `export HARNESS_DRIFT_BASE` in an agent shell never reaches it. Only a session restart with the variable set would. SP-007 proposed a per-branch base binding and the Tech Lead rejected it on 2026-11-16. The control is operational: run `check --live` with `HARNESS_DRIFT_BASE=c337df7`, which every feature's evidence records, and accept the Stop-hook FAILs until a restart. SP-008 (a feedback loop for the learning gate) was also rejected. *Next time:* set `HARNESS_DRIFT_BASE` in the environment that launches the runtime before the first session on a stacked worktree.
2. **Shared scope across tasks causes DRIFT-02 churn.** Several tasks owned changes to `telemetry-lib.mjs`, `telemetry-lib.test.mjs`, or the copy produced by `kit vendor`. Each landing reopened earlier `passing` features: TASK-003 three times, TASK-004 twice, and also TASK-005, -008, -009, -001, -007, -010, -012, and -014. Two things were needed on every reopen: rerun the verification and write fresh evidence. The stale `evidence_hash` also has to be dropped, because otherwise `asdd sync` keeps the old one and the feature stays drifted (sessions 019 and 042, commit `b7deb4b`). The coordinator reported the "delete on reopen" step. It is not stated word for word in session evidence. *Next time:* apply SP-002 (one owning task per file) to shared libs too. Put each lib change in one task, or order the tasks so the lib lands last.
3. **Tests must honour the same root seam as production code.** The TASK-005 test isolated the gate's root and state, but not the learning-signal writer. The signals it leaked opened bogus `command:*` patterns (LP-c5d0eb9a and LP-e19c5fd7 first appear on 2026-11-17, and LP-eb7bb53b's count went up). *Next time:* when a hook gets a `root` seam, every write path in that hook takes it. Add a test that asserts "no signal written to the repo the tests run from", as session 039 did.
4. **Edit live hooks on a scratch copy.** The command gate, Verify-on-Stop, `check-invariants`, and `.claude/settings.json` run on every tool call or Stop. The slice tested them on scratch copies first: mutation RED on a scratch copy of the gate and the hook, and a HEAD-vs-new comparison of 11 payloads with 0 differences (sessions 021, 033, 034). The live hook was replayed with the committed fixture (session 062). Only then was the file replaced. The coordinator reported that the replacement was an atomic swap. A broken gate would have blocked or silently allowed every command in the session doing the work. *Keep doing this.*
5. **Briefs for sub-agents need hard stops.** The coordinator reported two problems that are not in session evidence: one worker started TASK-006 without being asked, and others hit turn or rate limits partway through a task. Briefs with an explicit "stop after TASK-N, do not start another task" and a single task scope kept later waves in bounds. The one concurrent run that was approved (TASK-010 with TASK-005, session 030) declared disjoint scopes up front and caused no conflict.
6. **Decide that a runtime is hookless when its payload cannot be captured.** No live Cursor `beforeReadFile` payload could be captured. D-3 (session 054) made Cursor hookless for guidance loads instead of building a parser on a guessed payload. The Claude payload keys are proven by fixtures (TASK-001, ADR-004). The cost was spec errata 1.1.1 (session 070). Those errata then exposed the requirement mismatch behind UNCOV-002. *Next time:* when a D-* decision supersedes criteria, search the code and tests for the old behavior in the same change, not only the spec and design.
7. **QA probes find what coverage counts miss.** Both BLOCKs came from QA running the CLI against a broken or hand-edited input. Coverage percentages and EARS counts were already 100% or close to it. A fail-open requirement needs a test that breaks the dependency, not only a test of the happy path.

## Confidence and uncertainty (INFO, QG-DEC-10)

The TASK-005 implementation confidence was 0.85 (session 022). The uncertainty was that the `runHook` seam added `root`/`state` beyond what the design specified. That gap is the one that later leaked signals (lesson 3). The uncertainty debt was in test isolation, not in the design.

## Open items (no decision taken here)

- **LP-eb7bb53b (`command:rm -rf`), LP-c5d0eb9a (`command:git push --force`), LP-e19c5fd7 (`command:sudo`):** `open`, partly or wholly inflated by the leaked test signals (lesson 3). The Tech Lead has not decided yet (session 080). No proposal was written.
- **LP-f374bf6d (`sensor:DRIFT-02`):** `open`, reopened ×8 because SP-005 is `ineffective`. This slice's shared-scope reopens are likely among the recurrences, although the pattern attributes no slice. It needs a new proposal that explains why SP-005 did not stop them. The Tech Lead has to request it.
- **Follow-up slice for QA-F-003 + KPI-1:** the command gate's own module-load crash and Verify-on-Stop's own crash do not block (session 075). It is recorded but not opened.
- QA-F-004..006 (test hardening) were skipped by Tech Lead decision (session 075).
