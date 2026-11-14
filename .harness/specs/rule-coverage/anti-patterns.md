# Anti-pattern findings: rule-coverage

Draft: `requirements.md` (REQ-001…005, AC-001…005). Skill: `anti-pattern-detection`.

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 0 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 1 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 0 | 0 |
| AP-7 Mega-capability | CRITICAL | 0 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

## Resolved

- **AP-4, REQ-004 "noisy"** — defined in design (ADR-004): a rule is noisy at ≥ 50 hits or hits in ≥ 20 files; the
  thresholds are returned with the result so a reader sees them.

## Matches judged not a violation

- **AP-1, REQ-001/003** — folder names and `semgrep --test` are the conventions the Tech Lead's tools already use
  (kit ADR skill, Semgrep); the requirement is the behavior over them.
