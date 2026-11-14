# Anti-pattern findings: spec-drift-depth

Draft: `requirements.md` (REQ-001…004, AC-001…004). Skill: `anti-pattern-detection`.

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 0 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 2 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 0 | 0 |
| AP-7 Mega-capability | CRITICAL | 1 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

## Resolved

- **AP-4, REQ-002 "riskiest"** — defined by the score formula and the level thresholds in the requirement.
- **AP-4, REQ-001 "test files"** — defined in design (ADR-002): path patterns per language.
- **AP-7, the slice** — four outcomes; one slice because they share one server and one release, split into four
  independent requirements and tasks.

## Matches judged not a violation

- **AP-1, REQ-003/004** — the table columns, rule ids, tool names, and the protocol capability are the interface the
  actors use, not an internal choice.
