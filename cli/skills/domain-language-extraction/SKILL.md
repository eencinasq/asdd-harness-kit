---
name: domain-language-extraction
description: Extracts domain-specific terminology from business documents into a ubiquitous language dictionary. Seeds the domain slice.
---

# Domain Language Extraction

Applies 5 extraction techniques to business text:

1. **Noun Phrase Extraction** — Domain-specific nouns, filtering generic terms
2. **Entity Pattern Recognition** — Business objects, events, processes, rules
3. **Acronym Detection** — Industry acronyms with expansions
4. **Relationship Extraction** — Ownership, association, composition, hierarchy
5. **Action/Command Extraction** — Domain verbs that become operations

## Output

Structured ubiquitous language dictionary with:
- Core Domain Entities (name, definition, context, lifecycle, relationships)
- Personas (definition, variants, key behaviors)
- Domain Events (trigger, context, downstream effects)
- Domain Processes (steps)
- Business Rules (definition, implication)
- Metrics (definition, current/target)
- Acronyms (expansion)
- Terms to Avoid (vague terms with specific alternatives)

## Integration

Extracted terms feed into `domain-model.md`. Terms not found in existing model are flagged as uncertainty factors.

## Confidence Scoring

- 1.0: Term appears >10 times consistently
- 0.9: 5–10 times, meaning inferred
- 0.8: 2–4 times, may need clarification
- < 0.8: Ambiguous meaning
