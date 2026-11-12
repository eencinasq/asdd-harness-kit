# Anti-pattern findings: agents-spec

Draft: `.harness/specs/agents-spec/requirements.md` (REQ-001…006, AC-001…006). Glossary: `capability.md`.

## Summary

| Pattern | Severity | Occurrences | Unresolved |
|---|---|---|---|
| AP-1 Solution masquerading as requirement | CRITICAL | 1 | 0 |
| AP-2 Missing acceptance criteria | CRITICAL | 0 | 0 |
| AP-3 Vague actor | HIGH | 0 | 0 |
| AP-4 Undefined subjective term | HIGH | 0 | 0 |
| AP-5 Missing trigger or event | MEDIUM | 0 | 0 |
| AP-6 Non-testable outcome | HIGH | 0 | 0 |
| AP-7 Mega-capability | CRITICAL | 0 | 0 |
| AP-8 Passive voice hiding the actor | MEDIUM | 0 | 0 |

Clean: REQ-001, REQ-002, REQ-003, REQ-005, REQ-006

## Findings

- **AP-1, REQ-004 — not a violation.** "Claude Code `tools` … Cursor `readonly` … OpenCode `permissions` and `steps`".
  These are product field names, but the problem itself names those runtimes (the actor already uses them; the Tech Lead
  chose projection to them). Counter-case: a runtime-neutral wording ("restrict edits") would leave the output
  unverifiable per runtime — rejected, AC-004 needs the field to check.
- **AP-5, REQ-001/002/003/005** — Universal by intent (hold for every shipped agent at all times).
- **AP-7** — 6 REQs, 6 ACs, 3 entities: under the limits.

Score: 1.0
