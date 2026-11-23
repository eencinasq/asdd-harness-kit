# mutation-testing — Spec Validation Report

**Author:** asdd-validation-agent · **Model/Tool:** claude-opus-5-5 · **Date:** 2026-11-23 · **Report version:** 1.1 (supersedes 1.0)
**Requirements validated:** 1.1.0 (READY; spec gate PASS; TL `override` session 005 for CON-002/CON-003) · **Mode:** full
**Risk:** MEDIUM · **Confidence:** 0.85 · **Auto-approval eligible:** no · **Blocking:** 0 · **High:** 0 · **Medium:** 4 · **Low:** 4
**Uncertainty factors:** (1) the dogfood copy `.harness/steering/quality-gates.exec.md` mirrors `cli/steering/`, so QG-SPEC-11 must land in both (no REQ names the copy); (2) the 30-minute limit (REQ-006) has not been checked against real Stryker or PIT run times.

## Gate Decision

**PASSED → gate PASS.** QG-VAL-04 applies: no BLOCKING or HIGH finding remains, and the confidence of 0.85 is at least 0.75. QG-VAL-05 applies because a prior report exists: its only BLOCKING finding, CON-001, is resolved by REQ-012 and REQ-014. The MEDIUM findings below do not change the gate. They are carried into Design as concerns.

## Summary

Version 1.1.0 makes the sensor deterministic. It adds a defined file set, an evaluation order, an `error` status with a timeout, the `{files}`-absent case, and a fixed JSON shape. Equivalents are recorded in the source, so the exit-code contract still holds. The QA rule becomes `QG-SPEC-11`, and the slot is optional (Tech Lead decisions). The remaining gaps are in the skill guidance and in QA's view of inline disables. DOM-001 waits for the Domain phase.

## Open findings (v1.1)

| ID | Sev | REQ | Evidence | Correction |
|---|---|---|---|---|
| AMB-009 | MEDIUM | 010, 011, 012 | The triggers overlap. A survivor in dead code, or an equivalent one, inside "a file of a feature with a MUST requirement" also matches REQ-010, so the agent could test dead code. | Classify first: REQ-012 (equivalent), then REQ-011 (dead), and REQ-010 "otherwise". Add an eval case for the dead-code-in-MUST-file case. |
| AMB-010 | MEDIUM | 013 | "until it reports `pass`" never ends when the result is `unconfigured`, `no-files`, or `error`. | Add: on `unconfigured` or `no-files`, record the result in `evidence` and stop; on `error`, stop and escalate. |
| ACT-001 | MEDIUM | 012, 014 | Under QG-SPEC-11, a source-level disable (REQ-012) gives `pass`. The implementing agent decides equivalence about its own code, and no actor reviews the disable comments. | REQ-014: QA lists every mutation-disable comment added in the slice's feature files, with its reason, in `spec-coverage-report.md`. A disable with no reason leaves the requirement uncovered. |
| DOM-001 | MEDIUM | all | `docs/architecture/domain-model.md` still has 0 hits for the four `glossary.md` terms. | The Domain phase adds Mutant, Surviving mutant, Equivalent mutant, and Mutation command. Hand off to asdd-domain-agent. |
| AMB-011 | LOW | Definitions | "other harness-managed paths" names no source. | Cite `harnessManaged(root)` (`cli/src/harness/drift-lib.mjs:143`: `installed-versions.json` managed and unmodified seeded files). |
| TRC-002 | LOW | 014 | `QG-SPEC-11` is mapped only to `cli/steering/quality-gates.exec.md`. The kit's `.harness/steering/quality-gates.exec.md` is currently identical. | Map the dogfood copy too, or name the regen step that syncs it. |
| AMB-012 | LOW | 008 | `features` and `files` values are not stated for `unconfigured`, which is evaluated before the file set (REQ-005 → 003 → 004). | State that they are still computed, or that they are `[]`. |
| RSK-001 | LOW | 006 | The fixed 30-minute limit kills the tool. An in-place mutator, such as older versions of mutmut, can leave a mutated source file. | Report `error` with the path list, or make the limit a binding (`Mutation timeout`). Note the risk in the REQ-015 slot docs. |

## Prior Finding Resolution Check (v1.0)

| ID | v1.0 Sev | Status | Resolved by |
|---|---|---|---|
| CON-001 | BLOCKING | resolved | REQ-012: inline disable plus reason, cited in `evidence`. REQ-014: only `pass` counts. |
| CON-002 | HIGH | resolved | REQ-014 adds `QG-SPEC-11` (Tech Lead `override` 005; QG-SPEC-10 is taken at `quality-gates.exec.md:41`). Intent maps the file. |
| CON-003 | HIGH | resolved | REQ-015: optional slot in "Spec drift and audit bindings". REQ-014: `unconfigured` = INFO (Tech Lead `override` 005). |
| CON-004 | HIGH | resolved | REQ-006: `error`, exit 2, 30-minute timeout (see RSK-001). |
| AMB-001 | HIGH | resolved | The "Feature files" definition (see AMB-011). |
| AMB-002 | HIGH | resolved | REQ-014: `survivors`/`error` → `UNCOV-NNN`; `unconfigured`/`no-files` → INFO. |
| AMB-003 | MEDIUM | resolved | REQ-002, REQ-005, and the "Selected features" definition. |
| AMB-004 | MEDIUM | resolved | REQ-001 (first value), REQ-007 (`files_substituted: false`). |
| AMB-005 | MEDIUM | resolved | Evaluation order: REQ-005 → 003 → 004 → 001. |
| AMB-006 | MEDIUM | resolved | REQ-008 (see AMB-012). |
| AMB-007 | MEDIUM | resolved | REQ-016: one case per behavior. |
| TRC-001 | MEDIUM | resolved | REQ-009 (registry plus e2e). Intent maps semgrep, README, skills index, and `versions.json`. |
| DOM-001 | MEDIUM | open | Owned by the Domain phase (above). |
| EARS-001 | LOW | resolved | Split into REQ-010…013. |
| AMB-008 | LOW | resolved | REQ-003 (literal text), REQ-001 (POSIX single quotes). |

## Agile Governance Recommendation
Standard flow. Hand off to asdd-domain-agent (DOM-001), then Design. Design should close AMB-009, AMB-010, and ACT-001 by amending the spec before Task Planning; otherwise the Tech Lead acknowledges them. The LOW findings go into the next revision.
