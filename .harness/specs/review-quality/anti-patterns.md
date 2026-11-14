# Anti-pattern findings: review-quality

Draft: `requirements.md` (REQ-001…005, AC-001…005). Skill: `anti-pattern-detection`.

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 0 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 0 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 0 | 0 |
| AP-7 Mega-capability | CRITICAL | 0 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

Clean: REQ-001…005

## Matches judged not a violation

- **AP-1, REQ-002/004/005** — name commands (`pnpm eval score`, `pnpm eval harvest`, `asdd learn`) and files. They are
  the existing interfaces the actors use; the requirement is their behavior.
- **AP-4, REQ-003** — "synthetic" is defined by contrast with harvested cases (REQ-004): authored for the kit, no client code.
