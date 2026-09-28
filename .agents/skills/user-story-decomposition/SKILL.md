---
name: user-story-decomposition
description: Decomposes epics and large user stories into atomic, testable capabilities using 8 splitting patterns.
---

# User Story Decomposition

Applies 8 splitting patterns in order:

1. **Workflow Steps** — Multi-step process
2. **CRUD Operations** — Implies create/read/update/delete
3. **Business Rules** — Multiple conditions or variations
4. **Actor Variations** — Different roles need different capabilities
5. **Data Variations** — Different data types or sources
6. **Platform Variations** — Multiple platforms with different behavior
7. **Performance Variations** — Different scale requirements
8. **Happy Path vs. Error Handling** — Implies exception scenarios

## Atomicity Checks

Each decomposed capability must be:
- Independently valuable to a user
- Testable with clear acceptance criteria
- Fewer than 5 functional requirements
- No duplication with other capabilities

## Output

Capability entries grouped under Capability Groups with MoSCoW priority and pattern attribution.

## Confidence Scoring

- 1.0: Clear epic with obvious decomposition
- 0.9: Minor assumptions needed
- 0.85: Multiple valid approaches
- < 0.85: Flag for PO clarification
