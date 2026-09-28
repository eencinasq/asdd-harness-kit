---
name: anti-pattern-detection
description: Detects 8 specification anti-patterns in capabilities and requirements. Acts as a quality gate before finalization.
---

# Anti-Pattern Detection

Runs an 8-pattern detection pipeline against capabilities and requirements:

1. Solution Masquerading as Requirement (CRITICAL) — Technology terms in capability
2. Missing Acceptance Criteria (CRITICAL) — No EARS patterns found
3. Vague Actors (HIGH) — Generic terms: "user", "admin", "person"
4. Undefined Subjective Terms (HIGH) — "fast", "scalable", "user-friendly"
5. Missing Trigger or Event (MEDIUM) — "system shall" without WHEN/IF/WHILE
6. Non-Testable Outcome (HIGH) — Vague verbs: "support", "enable", "handle"
7. Mega-Capability (CRITICAL) — >10 FRs, >8 criteria, >7 entities
8. Passive Voice (MEDIUM) — "is stored", "are created", "will be sent"

## Scoring

Anti-Pattern Score = (8 - violations) / 8
- < 0.70 (3+ violations): BLOCK capability
- 0.70–0.85: WARN with fixes
- > 0.85: PASS

Each CRITICAL finding reduces agent confidence by 0.10, each HIGH by 0.05.

## Detection Pipeline Order

1. Solution Masquerading → extract tech, move to design notes
2. Missing Acceptance Criteria → generate EARS template
3. Vague Actor → suggest persona
4. Forbidden Terms → prompt for metrics
5. Missing Trigger → add trigger prompt
6. Non-Testable Outcome → suggest observable alternative
7. Mega-Capability → trigger decomposition skill
8. Passive Voice → convert to active voice

## Output Format

For each violation:
- Pattern Name, Severity, Original text, Issue, Suggested Fix, Action Required

Summary: Total analyzed, violations by severity, overall quality score.
