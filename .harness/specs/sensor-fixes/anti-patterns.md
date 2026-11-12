# Anti-pattern findings: sensor-fixes

Draft: `.harness/specs/sensor-fixes/requirements.md` (REQ-001…002, AC-001…002). Skill: `anti-pattern-detection`.

## Summary

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

Clean: REQ-001, REQ-002

## Matches judged not a violation

- **AP-1, REQ-002** — names two environment variables. They are the test's existing inputs, not a chosen solution; the
  requirement is the ordering (set before the configuration is read).
