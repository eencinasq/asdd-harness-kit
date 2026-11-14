# Anti-pattern findings: spec-drift-adoption

Draft: `requirements.md` (REQ-001…004, AC-001…004). Skill: `anti-pattern-detection`.

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 0 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 1 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 0 | 0 |
| AP-7 Mega-capability | CRITICAL | 1 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

## Resolved

- **AP-4, REQ-002 "direction"** — defined in design (ADR-004): better / worse when the total changed by more than 5 %
  between the first and last point, flat otherwise.
- **AP-7, the slice** — four outcomes; kept as one slice because they share one module and one release, but split into
  four independent requirements and tasks.

## Matches judged not a violation

- **AP-1, REQ-001/002/004** — file paths and command names are the interface the actors use (committed files, CLI
  commands), not an internal choice.
