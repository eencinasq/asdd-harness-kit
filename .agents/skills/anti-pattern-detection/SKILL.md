---
name: anti-pattern-detection
description: >-
  Judges drafted capabilities and requirements against eight specification anti-patterns and scores them. Use when a
  capability or requirements draft reaches its anti-pattern gate. Do NOT use for extracting terms — use
  domain-language-extraction; or for judging code — use codebase-audit.
metadata:
  tier: leaf
---

# Anti-Pattern Detection

Judges drafted capabilities and requirements against eight named anti-patterns, then proposes fixes. Two steps, in this
order: **detect** (a verdict per pattern, with evidence) and **propose** (a fix per confirmed finding). The skill reports
findings and the score; the gate decision belongs to `quality-gates.md` (`QG-DIS-02`…`04`).

**Operational boundary:** reads the draft under review; writes only `.harness/specs/<slice-id>/anti-patterns.md`. It
never edits the draft: fixes are proposals the calling agent or the PO applies.

## Input / Output Contract

- **Inputs:** `draft` (`path`, `.harness/specs/<slice-id>/capability.md` or `requirements.md`, required);
  `glossary` (`path`, `.harness/specs/<slice-id>/glossary.md` or `docs/architecture/domain-model.md`, optional — pins
  actors and defined terms).
- **Outputs:** `anti_pattern_report` (`markdown`, written to `.harness/specs/<slice-id>/anti-patterns.md`): a summary
  table with one row per pattern `AP-1`…`AP-8` (occurrences, unresolved count), the findings, and the line
  `Score: <0..1>`.

## Criteria

| # | Pattern | Severity | Violation | Not a violation |
|---|---------|----------|-----------|-----------------|
| AP-1 | Solution masquerading as requirement | CRITICAL | A technology, product, or design choice in a capability or requirement ("store in Redis", "a React modal") | A technology the problem itself names (integrating with an existing system the actor already uses) |
| AP-2 | Missing acceptance criteria | CRITICAL | A requirement with no EARS criterion | — |
| AP-3 | Vague actor | HIGH | A generic actor ("user", "admin", "person") where the text has no persona that pins it down | A generic word defined in the domain language or in the same capability |
| AP-4 | Undefined subjective term | HIGH | "fast", "scalable", "user-friendly", "secure" with no measure or reference | The term with a stated measure, or one the domain language defines |
| AP-5 | Missing trigger or event | MEDIUM | "The system shall …" with no WHEN / IF / WHILE / WHERE | A ubiquitous requirement that holds at all times by intent |
| AP-6 | Non-testable outcome | HIGH | A vague verb ("support", "enable", "handle", "manage") with no observable result | The same verb followed by the observable result |
| AP-7 | Mega-capability | CRITICAL | More than 10 FRs, more than 8 criteria, or more than 7 entities in one capability | — |
| AP-8 | Passive voice hiding the actor | MEDIUM | "is stored", "are created", "will be sent" where the actor is not clear | Passive voice whose actor is stated or obvious from the sentence |

The word lists are where to look, not the verdict: judge each match in its sentence. A listed word that is precise
where it stands (column "Not a violation") is not a finding.

## Execution Protocol

### Step 1: Detect

- **Action:** for each capability or requirement, check AP-1…AP-8 in order. Give every match a verdict:
  `violation` (quote the text and say which part meets the criterion), `not a violation` (name the case that applies),
  or `unclear` (the text cannot settle it; it stays a finding and the question goes to the PO — never report it as
  clean). Before keeping a CRITICAL or HIGH violation, state the strongest counter-case and why it does not hold; if it
  holds, the match is not a violation.
- **Target:** the `draft` input.
- **Assertion:** every capability and requirement ID of the draft appears in the findings or in the line
  `Clean: <IDs>`; no text has been rewritten yet.

### Step 2: Propose

- **Action:** only after Step 1 is complete, give one fix per violation or unclear finding:

  | Pattern | Fix to propose |
  |---------|----------------|
  | AP-1 | Move the technology to design notes; restate the requirement as the behavior it needs |
  | AP-2 | An EARS criterion template with trigger and response left `PENDING_DEFINITION` |
  | AP-3 | A named persona from the domain language, or a question to the PO |
  | AP-4 | A question asking for the measure; never invent the number |
  | AP-5 | The trigger to add, as a question when the text does not imply it |
  | AP-6 | The observable result to state instead of the verb |
  | AP-7 | A split into smaller capabilities along their outcomes, proposed to the PO |
  | AP-8 | The active sentence with the actor named |

  A fix that needs a fact the text does not give (a metric, an actor, a trigger) is marked `PENDING_DEFINITION`
  (markers: `.harness/steering/skills.md`).
- **Target:** the findings of Step 1.
- **Assertion:** every `violation` and `unclear` finding has exactly one proposed fix.

### Step 3: Score and write the report

- **Action:** score = (8 − the number of patterns with at least one unresolved violation or unclear finding) / 8. It
  counts patterns, not occurrences, so it stays between 0 and 1; list occurrences per pattern next to it. Name the
  `QG-DIS-*` rule that applies; apply its thresholds from `.harness/steering/quality-gates.md`, never from this file
  (an unresolved CRITICAL finding blocks on its own, `QG-DIS-02`). Each unresolved CRITICAL or HIGH finding is an
  uncertainty factor of the phase confidence (`QG-DEC-10`): the calling agent lists it in the session `evidence`.
- **Target:** `.harness/specs/<slice-id>/anti-patterns.md`.
- **Assertion:** the file holds the summary table (8 rows), one entry per finding (pattern, severity, verdict, quoted
  text with file and ID, why it meets the criterion, counter-case, fix), and the `Score:` line.

## Verification Gate

1. `test -s .harness/specs/<slice-id>/anti-patterns.md` exits 0.
2. `grep -cE '^\| AP-[1-8] ' .harness/specs/<slice-id>/anti-patterns.md` prints 8 (one summary row per pattern).
3. `grep -E '^Score: (0(\.[0-9]+)?|1(\.0+)?)$' .harness/specs/<slice-id>/anti-patterns.md` matches once.
4. Negative check: `git diff --name-only -- <draft>` prints nothing (the draft was not edited by this skill).

## Escalation Gate

HALT when the draft is missing or names no capability or requirement IDs, when the glossary contradicts the
draft on an actor or term, or when a verdict needs a fact only the PO has and the gate cannot wait. Escalate as Context →
Options → Recommendation → Decision Needed; never resolve an `unclear` finding by guessing.

## Handoff & Convergence

- **redirect → `domain-language-extraction`:** when AP-3 or AP-4 hinges on a term the `glossary` does not define yet.
- None (terminal) otherwise: the calling agent applies the gate and the PO decides the fixes.
