# mutation-testing — Spec Coverage Report

**Author:** asdd-qa-agent · **Model/Tool:** claude-opus-5-5 · **Date:** 2026-11-23 · **Mode:** full · **Run:** 4
Inputs: requirements.md 1.1.0 (READY), design.md 1.1.0 (READY), tasks.md, features TASK-001…003 (`passing`).

## Gate Decision

**PASSED (run 4).** UNCOV-007 is closed. Every MUST requirement (15/15) and the SHOULD requirement (1/1) has a test
that asserts its observable behavior, and all tests pass. No BLOCK criterion of QG-SPEC-03…06 applies, no WARN of
QG-SPEC-07/08 applies, and no HIGH domain-placement finding is open (QG-DOM-06). QG-SPEC-11 is INFO (`unconfigured`).

## Test runs (run 4)

| Command | Result |
|---|---|
| `node --test cli/src/harness/mutate.test.mjs cli/test/mutation-testing.test.mjs` (this session) | 16 pass, 0 fail |
| `node cli/bin/asdd.mjs skill-eval --skill mutation-testing` (this session) | 4/4 pass |
| `asdd drift --slice mutation-testing --requirements` (this session) | PASS, clean |
| `asdd mutate --slice mutation-testing --json` (this session) | `unconfigured`, exit 0. **QG-SPEC-11: INFO**, no disable comments |
| `npm test` (orchestrator, same session) | 529 pass, 0 fail |
| `bash cli/test/full-pipeline.sh` (orchestrator, same session) | OK |
| `asdd check` (orchestrator, same session) | PASS |

**Hand mutant M17** (the one run 3 found surviving): the auditor removed `!isExempt(f, managed) && ` from
`cli/src/harness/mutate.mjs:48` in a scratchpad copy and ran `mutate.test.mjs`. Result: 11 pass, 1 fail. The failing
test was `REQ-001 selection: files the kit installer manages are never handed to the tool, outside .harness/ too`
(`mutate.test.mjs:110`), so M17 is **killed**. The working tree was not touched. Run 3's other results still stand:
22 mutants killed and 3 equivalent (M6, M18, M22).

## Coverage matrix (run 4)

| REQ | Pri | Test(s) | Status |
|---|---|---|---|
| REQ-001 | MUST | mutate.test `REQ-001`, both `REQ-001 selection` tests (incl. managed files), CLI exit cases | COVERED |
| REQ-002…REQ-008 | MUST | mutate.test `REQ-002`…`REQ-008` | COVERED |
| REQ-009 | MUST | registry.test, full-pipeline §3, fixture probes of `mutate --help` | COVERED |
| REQ-010…REQ-013 | MUST | skill-eval fixtures (one each) + non-vacuity test | COVERED |
| REQ-014, REQ-015 | MUST | mutation-testing.test `REQ-014`, `REQ-015` | COVERED |
| REQ-016 | SHOULD | mutation-testing.test `REQ-016` | COVERED |

**Metrics:** MUST 15/15 = 100%. EARS criteria for MUST requirements: 100%. SHOULD 1/1 = 100%. Spec coverage 16/16 =
100%. Pass rate 100%. No COULD requirements.

## Uncovered detail (open)

None.

## Observations (INFO)

- **OBS-001.** `cwd` (M6) is equivalent on the CLI path. The coordinator accepted this.
- **OBS-003.** The skill fixtures assert skill text. The REQ-016 test shows that each fixture fails on a body with
  its rule removed, so the fixtures count as coverage.
- **OBS-004.** QG-SPEC-11 is INFO because this repo has no bound `Mutation command`. Coverage rests on tests and hand
  mutants, not on a tool run.

## Domain placement (QG-DOM-06)

`Active findings: none`. The boundary gate passes (`npm test`, 529 pass). `cli/src/harness/mutate.mjs` stays in the
Harness layer, as `docs/architecture/domain-model.md` § Mutation testing places it. The slice has no
`code-review-report.md`.

## History

**Run 3: BLOCKED.** MUST 14/15. Tests: `npm test` 528 pass, 15 slice tests pass. UNCOV-004, UNCOV-005 (the
`.harness/` half), and UNCOV-006 were closed.
- UNCOV-007 (LOW, REQ-001): harness-managed paths outside `.harness/` were untested (M17 survived). Closed in run 4.

**Run 2: BLOCKED.** MUST 14/15. Tests: `npm test` 527 pass. Run 1's UNCOV-001…003 and OBS-002 were confirmed closed.
- UNCOV-004 (MEDIUM): `in_progress` selection was untested. Closed in run 3.
- UNCOV-005 (MEDIUM): harness-path exclusion was untested. Split; the managed-files half became UNCOV-007.
- UNCOV-006 (LOW): `replaceAll` (each `{files}`) was untested. Closed in run 3.

**Run 1: BLOCKED.** MUST 10/15. Tests: `npm test` 525 pass. All four findings were closed in run 2.
- UNCOV-001 (HIGH, REQ-005): no usage line for an unknown slice or feature. A defect.
- UNCOV-002 (HIGH, REQ-001/004/006): the exits for pass, no-files, and error were untested.
- UNCOV-003 (MEDIUM, REQ-008): the JSON `command` and the `output_tail` order and limit were untested.
- OBS-002: the timeout value was unpinned.
