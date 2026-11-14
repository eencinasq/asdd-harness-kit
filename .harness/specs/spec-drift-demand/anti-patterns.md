# Anti-pattern findings: spec-drift-demand

Draft: `requirements.md` (REQ-001…006, AC-001…006). Skill: `anti-pattern-detection`.

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 0 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 0 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 1 | 0 |
| AP-7 Mega-capability | CRITICAL | 1 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

## Resolved

- **AP-6, REQ-005** — a real CodeQL run cannot be tested here (no CLI); the criterion tests the adapter with a fake
  runner and the wiring end to end, and says so.
- **AP-7, the slice** — six on-demand items; one slice because they share one server and one release, split into six
  independent requirements and tasks.

## Matches judged not a violation

- **AP-1, REQ-004/005** — the action, the CLI commands, and the engine variable are the interface the actors use.
