# Anti-pattern report: telemetry-emitters requirements

**Author:** asdd-spec-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)
**Date:** 2026-11-16

**Draft judged:** `.harness/specs/telemetry-emitters/requirements.md` (REQ-001…REQ-025, spec version 1.1.0).
**Glossary:** `.harness/specs/telemetry-emitters/glossary.md`, `docs/architecture/domain-model.md`.

**History:**
- Discovery: `capability.md` judged 1.0, QG-DIS-04 PASS (session `003-discovery-completed.json`).
- Spec 1.0.0: judged 1.0 (session `004-spec-completed.json`). Validation (`spec-validation-report.md` v1.0, RSK-001)
  ruled AP-7 a violation of the literal criterion.
- Spec 1.1.0: this report. AP-7 is resolved by a TL/PO override, not by the spec agent's reinterpretation.

## Summary

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 5 matches | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 1 match | 0 |
| AP-4 Undefined subjective term | HIGH | 3 matches | 0 |
| AP-5 Missing trigger or event | MEDIUM | 1 match | 0 |
| AP-6 Non-testable outcome | HIGH | 1 match | 0 |
| AP-7 Mega-capability | CRITICAL | 1 violation (accepted by override) | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 1 match | 0 |

## Findings

### AP-1 Solution masquerading as requirement (CRITICAL)

**Finding 1: REQ-001, "a single write call opened in append mode"; REQ-001/REQ-002 "4,096 bytes".**
- Verdict: not a violation.
- Counter-case: the write mechanism is an implementation choice.
- Why it does not hold: intent MH-01 names "one ≤4 KB `O_APPEND` write", and binding guardrail AR-1 / v2 D-3 fixes it.
  The problem names it.

**Finding 2: REQ-013, REQ-014, REQ-024, REQ-025 name `PostToolUse` (matcher `Read|Skill`), `beforeReadFile`, and
`asdd observe`.**
- Verdict: not a violation.
- Why: approved as scope by the PO decision of 2026-11-16 (Q-1). The runtimes are systems the actor already uses, and
  no criterion can be checked per runtime without naming the event.

**Finding 3: REQ-021, "read with the same frontmatter parser as `validators/steering-tags.mjs`".**
- Verdict: not a violation.
- Why: assumption A-04 (PO-accepted) defines "expected steering" by those frontmatter rules. The clause pins the
  meaning of "expected".

**Finding 4: REQ-024, file paths (`commands.mjs`, `HARNESS_FILES`, `ensureGitignore`, `tools/*/…`).**
- Verdict: not a violation.
- Why: AR-5 and the PO-narrowed MH-05 list (Q-6) are a registration checklist over existing kit surfaces.

**Finding 5 (new in 1.1.0): REQ-002, "no producer loads the telemetry library through a static import"; REQ-018,
"in-process handler time".**
- Verdict: not a violation.
- Counter-case: the import style and the timing boundary are design details.
- Why it does not hold: both were stated by the PO resolution of 2026-11-16 (NFR-002, AMB-001 / Q-14). The import
  rule is the observable reason a load failure can be caught, and the measurement boundary makes the budget testable.

### AP-2 Missing acceptance criteria (CRITICAL)

No match. Every REQ-001…REQ-025 has at least two EARS criteria.

### AP-3 Vague actor (HIGH)

**Finding 1: REQ-001…REQ-006, "any kit process" / "every telemetry producer".**
- Verdict: not a violation. Each requirement defines the actor as an enumerated list.
- REQ-017 now also names who sets the attribution env var (the human who launches the runtime; ACT-001).

### AP-4 Undefined subjective term (HIGH)

**Finding 1: "the tail" (REQ-019, REQ-022).** Not a violation: defined in the conventions as the last 500 lines or
262,144 bytes, whichever is smaller (Q-10).

**Finding 2: "unambiguous" (REQ-017).** Not a violation: defined by the criteria (explicit env var naming an existing
slice, or exactly one `in_progress` slice). The env var name is OI-1; its contract is pinned.

**Finding 3: "surface share of slice time" (REQ-020).** Resolved in 1.1.0 (AMB-005): surface is a span `kind` in
{`command`, `hook`, `sync`}, share is that surface's attributed `duration_ms` over the summed session phase durations,
and the hits term is `0` while no H-* heuristic is evaluated.

### AP-5 Missing trigger or event (MEDIUM)

**Finding 1: REQ-011 (criteria 1 and 3), REQ-012 (criteria 1–2), REQ-018 (criterion 6), REQ-024 (criterion 1) use the
ubiquitous form "The <artifact> shall …".**
- Verdict: not a violation. These are universal by intent: they hold for the delivered artifact at all times. Each
  names its verifying check (a test, the Task Planning review, or the merge checklist). This applies validation
  EARS-001.

### AP-6 Non-testable outcome (HIGH)

**Finding 1: REQ-023, "provides `--slice <id>`, `--bottlenecks`, and `--json`".**
- Verdict: not a violation. The description verb is followed by observable criteria: exit codes `0`/`2`/`3` with the
  CON-004 precedence, the JSON keys, and "absent, never `0`".

### AP-7 Mega-capability (CRITICAL)

**Finding 1: 25 requirements and 14 referenced entities in one slice.**
- Verdict: **violation of the literal criterion** ("more than 10 FRs … more than 7 entities"), as ruled by validation
  RSK-001. The spec agent's 1.0.0 counter-case ("AR-5 forbids a split") is withdrawn: AR-5 governs registration
  atomicity, not slice size.
- **Resolution: accepted by TL/PO override, 2026-11-16.** The PO (eencinas) approved validation's recommended Option B
  ("approve recommendations"), relayed by the orchestrator and recorded in session
  `006-spec-revised.json`.
- Reason: REQ-012 already sequences the AR-2 waves, each behind green invariants. Each REQ is atomic and traced.
  Splitting now (Option A, `telemetry-emitters` / `telemetry-activation`) would re-run discovery and spec for little
  gain.
- Residual risk: delivery size (about 30 files, several shared with `skill-eval` and `asdd-ui`, R-5). Task Planning
  mitigates it through the wave order.
- Status: resolved by override. It is not counted as unresolved for QG-SPC-02, because the waiver is a human decision,
  not an agent reinterpretation.

### AP-8 Passive voice hiding the actor (MEDIUM)

**Finding 1: REQ-020/REQ-022, "computed in memory", "no span … is written".** Not a violation: the subject of the
sentence is `asdd profile`. The 1.0.0 REQ-018 match ("before field names are fixed in code") was removed in 1.1.0;
REQ-012 now orders the fixture task.

### Clean

REQ-003, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-015, REQ-016.

## Proposed fixes

None open. The AP-7 violation has a human-approved resolution (override, Option B); no other finding is a violation or
unclear.

## Gate

The gate that applies is QG-SPC-02 (`.harness/steering/quality-gates.phases.md`). The anti-pattern score is at least
0.70, and the only CRITICAL violation (AP-7) is resolved by a TL/PO override dated 2026-11-16, so it does not block.

Score: 1.0
