---
name: domain-language-extraction
description: >-
  Extracts the domain terms a business text states into a source-cited glossary. Use when an intent, pitch, or
  requirements draft needs its vocabulary pinned. Do NOT use for judging requirement quality — use
  anti-pattern-detection; or for a canvas — use business-model-canvas.
metadata:
  tier: leaf
---

# Domain Language Extraction

Builds the ubiquitous language glossary from the business text supplied (intent, pitch, documents, transcripts).
**Only from that text:** every term, definition, and relationship cites where the text says it. Nothing comes from
general knowledge of the domain or from the codebase.

**Operational boundary:** reads the supplied text and `docs/architecture/domain-model.md`; writes only
`.harness/specs/<slice-id>/glossary.md`. Confirmed terms reach `domain-model.md` through the Domain agent, not this
skill.

## Input / Output Contract

- **Inputs:** `source_text` (`path` or pasted text, markdown or plain text, required);
  `domain_model` (`path`, `docs/architecture/domain-model.md`, optional — absent on a new project).
- **Outputs:** `glossary` (`markdown`, written to `.harness/specs/<slice-id>/glossary.md`): the sections listed in
  Step 2, every entry with a `source:` field, and an `## Open questions` section.

## Execution Protocol

### Step 1: Extract

- **Action:** apply five techniques to the text and list the raw terms, each with its source (document and section,
  heading, or line) and how many times it appears:
  - **Noun phrases:** domain-specific nouns; drop generic words ("system", "data", "information").
  - **Entity patterns:** business objects, events, processes, rules.
  - **Acronyms:** with the expansion the text gives.
  - **Relationships:** ownership, association, composition, hierarchy the text states.
  - **Actions:** domain verbs that become operations.
- **Target:** `source_text`.
- **Assertion:** every raw term has a `source:`; none comes from outside the text.

### Step 2: Classify

- **Action:** sort each term into one section: core domain entities (name, definition, lifecycle, relationships),
  personas (definition, variants, key behaviors), domain events (trigger, downstream effects), domain processes
  (steps), business rules (rule, implication), metrics (definition; current and target values only when the text gives
  them), acronyms (expansion), terms to avoid (the vague term, the specific alternative the text uses). A term that fits
  none stays in the raw list with a question.
- **Target:** the raw term list.
- **Assertion:** each term sits in exactly one section or carries a question.

### Step 3: Mark what the text does not say

- **Action:** a definition, lifecycle, relationship, or rule the text does not state is
  `ASSUMPTION — CONFIRMATION REQUIRED`, never written as fact. An acronym with no expansion in the text is
  `PENDING_DEFINITION`. A term used with two meanings is a conflict: list both, with their sources. (Markers:
  `.harness/steering/skills.md`.)
- **Target:** the classified glossary.
- **Assertion:** every marker and conflict is also listed under `## Open questions`, for the PO.

### Step 4: Compare with the model and write

- **Action:** check each term against `domain_model`; label it `new`, `matches`, or `contradicts` (with both sources).
  Rate each term's confidence: **high** (the text defines it, or uses it many times with one meaning), **medium** (a few
  uses, meaning from context, so the definition is an `ASSUMPTION`), **low** (one use, or conflicting uses: ask the PO).
  New terms, assumptions, and conflicts are uncertainty factors of the phase confidence (`QG-DEC-10`) that the calling
  agent records in the session `evidence`; the phase gates stay in `quality-gates.md`.
- **Target:** `.harness/specs/<slice-id>/glossary.md`.
- **Assertion:** the file exists and every entry has `source:` and a comparison label.

## Verification Gate

1. `test -s .harness/specs/<slice-id>/glossary.md` exits 0.
2. `grep -c '^## Open questions' .harness/specs/<slice-id>/glossary.md` prints 1.
3. Every entry cites its source: the count of entry lines (`grep -cE '^- \*\*'`) equals the count of `source:` fields
   (`grep -c 'source:'`).
4. Negative check: `git diff --name-only -- docs/architecture/domain-model.md` prints nothing.

## Escalation Gate

HALT when no source text is supplied, when the text is too short to name any entity, or when a conflict touches a term
the domain model already fixes and the phase cannot continue with both meanings open. Escalate as Context → Options →
Recommendation → Decision Needed; never pick one meaning of a conflicting term yourself.

## Handoff & Convergence

- **handoff → `anti-pattern-detection`:** when the glossary feeds an anti-pattern gate; passes `glossary`.
- The Domain agent merges confirmed terms into `domain-model.md`.
