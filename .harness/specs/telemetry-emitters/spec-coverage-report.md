# Spec Coverage Report: telemetry-emitters

**Author:** asdd-qa-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)
**Date:** 2026-11-17
**Inputs:** `requirements.md` 1.1.0 (REQ-001…REQ-025, all MUST), `design.md` (Status READY), `tasks.md`,
`spec-validation-report.md`, `.harness/features/telemetry-emitters.features.json` (14/14 `passing`), sessions 001…063,
`docs/architecture/domain-model.md` (Telemetry section), working tree at HEAD `0c7ce84` (clean).
**Confidence:** 0.88

## Gate Decision
BLOCKED

`QG-SPEC-06`: EARS criteria coverage for MUST requirements is 126/127, below 100%. The one open criterion,
**REQ-002 criterion 7**, has no test for the `asdd observe` producer, and the implementation does not meet it there:
`telemetry-observe.mjs` imports the telemetry library statically, so a lib load failure crashes the process with
exit 1 (UNCOV-001, verified by a probe in this session). No other BLOCK or WARN criterion applies. No HIGH
domain-placement finding is open (`QG-DOM-06`).

## Summary

| Metric | Target | Actual | Status |
|---|---|---|---|
| Spec-related test pass rate | 100% | 100%. `npm test` exit 0: 372/372 node tests, plus `kit vendor --check`, `kit self --check`, `cli/test/install.sh`, `cli/test/lifecycle.sh`, `skills-lint`, `agents-lint`, all exit 0. The focused slice files were also run on their own: 183/183. | PASS |
| MUST requirement coverage | 100% | 25/25. REQ-012 is verified by the artifact checks its criteria name (see the note below the table). | PASS |
| EARS criteria coverage (MUST) | 100% | 126/127 applicable. 129 criteria in total; 2 are superseded by the recorded D-3 decision (REQ-014 c1, REQ-025 c4). | **BLOCK** (`QG-SPEC-06`) |
| SHOULD requirement coverage | ≥ 95% | none in spec, so 100% (`QG-SPEC-02`) | PASS |
| COULD requirement coverage | INFO | none in spec | INFO |
| Spec coverage (happy + error path) | ≥ 95% | 24/25 (96%). REQ-012 has only artifact checks. | PASS |
| `QG-DRIFT-03` (MUST without a feature) | 0 | 0. `asdd drift --slice telemetry-emitters --requirements` returned `PASS spec drift — clean; files 48`. | PASS |
| Domain placement | no HIGH | no finding | PASS |

Latency evidence (from this session's `npm test` output):
- REQ-003 emit: p99 0.527 ms over 1,000 emits.
- REQ-008 / NFR-001 gate added time: p99 0.313 ms over 550 samples.
- REQ-018 in-process handler: every class passed the ≤ 50 ms gate.

**Note on REQ-012 (process/artifact criteria).** The spec gives REQ-012 c1/c2 the ubiquitous artifact form, and the
verifier it names is the Task Planning review. QA re-ran those checks in this session:
- the `depends_on` chain in the features file is TASK-004 → 005 → 006 → 007 → 008 → 009;
- TASK-010 depends on TASK-001, and TASK-012 depends on TASK-002;
- for c3, every feature's evidence records `npm test` and `check --live` exit 0, and both were re-run here with exit 0.

They count as covered on that basis. If the Tech Lead requires an automated test for process criteria, record it as a
`QG-SPEC-08` reading, not a BLOCK.

## Requirement coverage

Test files used in the table (`cli/src/harness/` prefix omitted):

| Short name | File |
|---|---|
| `tl` | `telemetry-lib.test.mjs` |
| `obs` | `telemetry-observe.test.mjs` |
| `prof` | `harness-profile.test.mjs` |
| `val` | `validators/telemetry.test.mjs` |
| `vos` | `verify-on-stop.test.mjs` |
| `cg` | `command-gate.test.mjs` |
| `sync` | `sync-state.test.mjs` |
| `inst` | `cli/test/install.sh` |
| `life` | `cli/test/install-lifecycle.test.mjs` |

The number after a short name is the test's line number.

| REQ | Criteria → pinning tests | Result |
|---|---|---|
| REQ-001 | c1 tl:101, tl:118 · c2 tl:101 (prefix hash) · c3 tl:137 (20 child processes) · c4 tl:168 | PASS 4/4 |
| REQ-002 | c1 tl:168 (`silent()` asserts no stdout/stderr, exitCode) · c2 tl:181, tl:194, tl:207 · c3 tl:217 · c4 tl:233 · c5 tl:267 · c6 tl:286, tl:118 (fd closed; see QA-F-004) · c7 cg:255, cg:279, vos:137, sync:412, val:369; **`asdd observe`: no test, and it fails (UNCOV-001)** | **6/7** |
| REQ-003 | c1 tl:298 (1,000 emits of 300–4,096 B, growth per line, p99) · c2 tl:168/181/194/217 + the producer load-failure copies cg:279, vos:137, sync:412, val:369 (design §9 proof map) | PASS 2/2 |
| REQ-004 | c1 cg:209 (QA-F-005) · c2 obs:221 · c3 obs:188, tl:830 · c4 tl:830, tl:920 · c5 tl:474, tl:484, obs:491, prof:242, prof:251; validator by import inspection (QA-F-005) | PASS 5/5 |
| REQ-005 | c1 tl:416, obs:188, cg:171, vos:104, sync:294 · c2 the same tests (`trace_source`, `writer`) · c3 tl:333, obs:336 · c4 tl:366, sync:294 · c5 tl:247, sync:294 · c6 tl:247 | PASS 6/6 |
| REQ-006 | c1 tl:516 (lib), tl:973 (policy), cg:372, sync:412, sync:452, obs:466, val:294, val:411, prof (every invocation asserts the tree hash) · c2 tl:516, sync:412 | PASS 2/2 |
| REQ-007 | c1 cg:171 · c2 cg:160, cg:171 (D-2: `cli` fallback) · c3 cg:149, cg:171 (`override` label per AMB-009) · c4 cg:223 · c5 cg:329 · c6 cg:171 (only `kind:"command"`) + tl:247 (`test` kind rejected; QA-F-005) | PASS 6/6 |
| REQ-008 | c1 cg:279 (corpus × 4 states, 0 differences) · c2 cg:279 (throw/deleted lib) · c3 cg:223, cg:255 · c4 cg:344 (added p99 ≤ 50 ms) | PASS 4/4 |
| REQ-009 | c1 vos:104 · c2 vos:104 (all five outcomes, both guard-skip forms, missing check and null status) · c3 vos:104 · c4 vos:104 (keys absent) · c5 vos:137 · c6 vos:137 (throw/deleted lib, unwritable) · c7 vos:173 · c8 the file itself | PASS 8/8 |
| REQ-010 | c1 sync:294 · c2 sync:294, sync:369 · c3 sync:294, sync:350 (QA-F-005) · c4 sync:350 · c5 sync:412 · c6 sync:385, sync:412 · c7 the file itself | PASS 7/7 |
| REQ-011 | c1 tl:1002 · c2 `asdd kit self --check` (in `npm test`, exit 0) · c3 tl:1002 | PASS 3/3 |
| REQ-012 | c1/c2 dependency chain checked by QA · c3 feature evidence + `npm test`/`check` re-run · c4 inspection: README/claude README claim only Claude wiring (D-3) | PASS 4/4 (artifact) |
| REQ-013 | c1 obs:188 · c2 obs:188 (`posttooluse-skill-installed`) · c3 obs:252 · c4 obs:348 (`Bash cat .harness/steering/…` → no record) | PASS 4/4 |
| REQ-014 | c1 **superseded by D-3** (Cursor is hookless; no record by design) · c2 obs:389, obs:597, obs:617 (allow for every input, 4 states) | PASS 1/1 applicable |
| REQ-015 | c1 tl:830, obs:188 · c2 tl:830, tl:957, obs:188 (`.claude/skills` alias) · c3 tl:830, obs:188 · c4 obs:188 (non-guidance fixture), obs:452 | PASS 4/4 |
| REQ-016 | c1 obs:266, obs:279 · c2 obs:266, obs:279 · c3 obs:297 · c4 obs:348, obs:373 · c5 obs:313, obs:336, obs:322 | PASS 5/5 |
| REQ-017 | c1 tl:665, tl:811 · c2 tl:665, tl:678 · c3 tl:765 · c4 tl:700, obs:322 · c5 tl:684, tl:690, tl:713, tl:719, tl:731, tl:742, tl:755 · c6 tl:789 | PASS 6/6 |
| REQ-018 | c1 obs:167 (four states), obs:597 · c2 obs:403, obs:433 · c3 inst `assert_claude_observe` (no `failClosed`) · c4 obs:503, obs:656 · c5 obs:535 · c6 obs:153 | PASS 6/6 (module-load case: UNCOV-001) |
| REQ-019 | c1 val:106 · c2 val:119 · c3 val:135, val:165 · c4 val:181 · c5 val:369 · c6 val:369 · c7 val:369 · c8 val:411 | PASS 8/8 |
| REQ-020 | c1 prof:195, tl:1068–1143 · c2 prof:195, tl:1156 · c3 tl:1172, tl:1194, prof:195, prof:225 · c4 prof:232, tl:1367, tl:1377 · c5 prof:195 (`FOOTER`) · c6 prof:262, prof:289 | PASS 6/6 |
| REQ-021 | c1 prof:298 · c2 prof:298 · c3 prof:298, prof:332 · c4 prof:298, prof:332 · c5 prof:298 (`devin` column `unknown`), tl:1210 · c6 prof:298 · c7 prof:298, tl:1210 · c8 prof:298, tl:1287 · c9 prof `run()` on every call, tl:1396 · c10 prof:344 | PASS 10/10 |
| REQ-022 | c1 prof `run()` tree hash on every invocation, tl:1410 · c2 prof:383, prof:392, tl:90 (constants) · c3 prof:392, tl:587, tl:613 · c4 prof:374 | PASS 4/4 |
| REQ-023 | c1 prof:195 · c2 prof:152 · c3 prof:162 · c4 prof:179, prof:289 · c5 prof:353 | PASS 5/5 |
| REQ-024 | c1 merge checklist checked by QA (D-3 removes the Cursor `beforeReadFile` item) · c2 `npm test` exit 0 this session · c3 QA probe (QA-F-006) · c4 inst:238 (`npm pack` file list) | PASS 4/4 |
| REQ-025 | c1 inst:295–300, inst:577–580 · c2 inst `assert_tel_ignores_once` after the second install · c3 inst `assert_claude_observe` · c4 **superseded by D-3**; inst `assert_no_cursor_observe` pins its absence · c5 inst:583–585 · c6 inst:540–542 · c7 inst:266–276, inst:299, inst:580 | PASS 6/6 applicable |

D-1 (uninstall, in scope) is pinned by `life:123`. After uninstall, `.claude/settings.json` is removed and `.gitignore`
returns to `dist/\n.env.local\n`, so the observe entry and both telemetry ignore lines are taken out.

## Uncovered Requirements

| ID | Requirement / criterion | Missing coverage | Severity |
|---|---|---|---|
| UNCOV-001 | REQ-002 c7 (and the AR-1 / TEL-4 fail-open rule) for the `asdd observe` producer | See the detail below. | HIGH (`QG-SPEC-06` BLOCK) |

UNCOV-001 detail:
- **Defect.** `cli/src/harness/telemetry-observe.mjs:14` is `import * as telemetry from './telemetry-lib.mjs'`, a
  static import. REQ-002 c7 says no producer may load the library that way. This also departs from design ADR-001
  ("each producer loads the lib with a guarded `import()`") and §2 ("the producers import `telemetry-lib` lazily").
  The design §9 proof row "load failure is caught" names TASK-010 as its owner, but no test copies the harness with a
  throwing or deleted lib for observe.
- **Probe (this session, scratchpad copy).** With a lib that throws on load, `node telemetry-observe.mjs claude`
  printed a stack trace and exited 1. With a deleted lib, `node telemetry-observe.mjs cursor` also exited 1.
- **Runtime impact today.** Low. Every wired hook command wraps the call in `>/dev/null 2>&1; exit 0`:
  `cli/src/install/phases.mjs:99-102` and the kit's `.claude/settings.json:30`. A direct `asdd observe` run is not
  wrapped.

**Action (Implementation agent):**
- Load `telemetry-lib.mjs` in `telemetry-observe.mjs` through a guarded dynamic import (ADR-001). The path into
  `handleObserve` must still exit 0 with the runtime's answer when the lib throws or is missing.
- Add a load-failure test in `telemetry-observe.test.mjs`. Follow the pattern of `cg:279` / `vos:137`: copy the
  harness, replace the lib with a top-level throw and with a deleted file, and assert exit 0, the answer, and empty
  stderr for `claude` and `cursor`.
- Keep the REQ-018 latency classes green.

Alternative: a Tech Lead waiver that accepts the hook wrapper as the fail-open layer, recorded as a spec errata to
REQ-002 c7.

## Findings

| ID | Severity | Summary | Suggested action |
|---|---|---|---|
| UNCOV-001 | HIGH | `asdd observe` loads the telemetry lib statically. A lib load failure makes the process exit 1 with a stack trace (REQ-002 c7, ADR-001), and no test covers the case. | Fix plus test, as above. Redirect to the Implementation agent; TASK-010 goes back to `in_progress`. |
| QA-F-001 | MEDIUM | `requirements.md` 1.1.0 is not amended for the recorded decisions D-2 and D-3 (see the list below). The decisions are in sessions 054 and `tasks.md`, but the normative text and the code disagree. | The Spec agent issues an errata 1.1.1 (TL acknowledgement) before Knowledge/merge, so future drift and QA runs do not read the superseded text as gaps. |
| QA-F-002 | LOW | Design §8(c) and §12 (table 12.1 Cursor row; 12.2 Cursor `beforeReadFile` entry; §9 row "run the installed Cursor … observe commands") still describe Cursor wiring that D-3 removed. Domain model line 55 lists `runtime (claude/cursor)` for Activation records, and line 76 cites REQ-014. | Design/Domain note "superseded by D-3 (2026-11-17)". Documentation only. |
| QA-F-003 | MEDIUM (pre-existing, outside REQ-008) | `command-gate.mjs` has static imports (`:21-22`) before `runHookCli` (`:211`). A module-load crash of the gate exits 1, and Claude Code `PreToolUse` does not treat exit 1 as a deny, so the gate is not fail-closed against its own load failure. Telemetry does not add to this: the lib import is guarded (`:99`). | Follow-up slice, alongside KPI-1 (Verify-on-Stop own crash). Not a REQ gap. |
| QA-F-004 | LOW | REQ-002 c6 is pinned for "no promise" (tl:286) and "fd closed" (tl:118). The "no listener or timer outlives the call" clause has no assertion. Code check: `telemetry-lib.mjs` has no `setTimeout`, `setInterval`, `.on(`, `async`, or `Promise`, and imports only `node:fs`, `node:path`, `node:crypto` (`:7-9`). | Optional: extend tl:474 to fail on those tokens in the lib source. |
| QA-F-005 | LOW | Several tests are weaker than their criteria (list below). Each pinned the substance, so all are counted as covered. | Optional test hardening. Not gate-relevant. |
| QA-F-006 | LOW | REQ-024 c3 ("a hand edit of a vendored `telemetry-lib.mjs` copy fails `kit vendor --check`") has no regression test. A QA probe on a scratch copy confirmed it: clean exit 0; after appending to `tools/knowledge/src/harness/telemetry-lib.mjs`, exit 1 with "is stale". | Optional: a `cli.test.mjs` case. |

Superseded criteria for QA-F-001:
- D-2: REQ-007 c2 says "`cursor` otherwise"; the code uses `cli`.
- D-3, Cursor is hookless:
  - REQ-014 c1;
  - REQ-021 c4 (Cursor listed as a runtime with load hooks);
  - REQ-024 c1 (Cursor `beforeReadFile` registration item);
  - REQ-025 c4.

Weaker tests for QA-F-005:
- REQ-004 c1 (cg:209) checks the marker and two substrings, not every whitespace token of the command.
- REQ-004 c5 has no-network tests for the lib, observe, and profile. `validators/telemetry.mjs` was verified only by
  reading its imports (`node:fs`, `node:path`, the lib).
- REQ-007 c6 has no test-runner command in the gate corpus. It is pinned through "the gate only emits `command`" and
  "the lib rejects `kind:"test"`".
- REQ-010 c3: the learn stub exits 3 *and* prints non-JSON, so "exit 0 + unparseable → ERROR" is not isolated. The
  code (`sync-state.mjs:413`, `ok: parsed && status === 0`) is correct.

## Domain Placement Findings

None. `Active findings: none` in the binding, so only `domain-layer.md` and its project binding apply.

Checked on the slice diff (`c337df7..HEAD`, 48 product files):
- `telemetry-lib.mjs` (domain service) imports only `node:fs`, `node:path`, `node:crypto`. It has no harness import and
  no cycle with `sync-state`.
- The producers (`command-gate`, `verify-on-stop`, `sync-state`) and `check-invariants` load the lib or validator
  through guarded `import()`.
- The adapters (`telemetry-observe`, installer) and the delivery code (`harness-profile`, `commands.mjs`) follow
  `CLI/hook → *-lib → state`.
- Boundary `cli/src/harness` must not import `.agents`: 0 import hits. The `.agents/skills` strings are data paths.

The six new terms are in `docs/architecture/domain-model.md` §Telemetry: Span, Activation record, Profile report,
Trace, Phase marker, Runtime hook host. UNCOV-001 is a TEL-4 behavior gap, not a layer violation.

## Code Review Notes

The slice has no `code-review-report.md`, so there are no CRITICAL/HIGH review findings to carry. QA-F-003 is
pre-existing and is handed to a follow-up, not to Refactor.

## Recorded decisions applied as scope (not gaps)

AP-7 override (no split); AR-3 rotation, `profiling.json` rollup, and H-* findings deferred (TRC-001); test spans and
turn/subagent spans deferred (Q-4, Q-2); D-1 uninstall in scope (pinned by life:123); D-2 runtime `cli` for direct gate
calls; D-3 Cursor hookless (session 054); KPI-1 out of scope; Q-14 latency is in-process handler time; OI-7 TEL-W3
handled in val:215/252/285.

## Recommendation

**Redirect to `asdd-implementation-agent`** for UNCOV-001: reopen TASK-010, add the guarded import and the load-failure
test, then re-run this gate.

In parallel, the Tech Lead decides on:
- QA-F-001: the spec errata 1.1.1 for D-2/D-3;
- QA-F-003: the follow-up slice with KPI-1.

The LOW findings are optional.

## Tools and commands used

- `npm test` (exit 0; 372/372 node tests plus `install.sh`, `lifecycle.sh`, `vendor --check`, `self --check`, lints).
- `node --test` on the 8 slice-related files (183/183).
- `HARNESS_DRIFT_BASE=c337df7 asdd drift --slice telemetry-emitters --requirements` (clean).
- `asdd knowledge trace req:telemetry-emitters:REQ-002` and `asdd knowledge search` (no prior `log:*` for this
  failure).
- The scratchpad probes for UNCOV-001 and QA-F-006.
- `grep`/`sed` reads of the code and tests.

Codegraph was skipped: the repository has no `.codegraph/` index.
