# Anti-pattern findings: spec-drift-empty

Draft: `requirements.md` (REQ-001…004, AC-001…004). Skill: `anti-pattern-detection`.

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

Clean: REQ-001, REQ-002, REQ-003, REQ-004

## Matches judged not a violation

- **AP-1, REQ-002/003** — name `.semgrep/architecture/` and an MCP prompt id. They are the interface the Tech Lead asked
  for (the analyzer already reads those folders; hosts list prompts by id), not an internal design choice.
- **AP-7, REQ-004** — six tools, one behavior (the same `no_data` shape); kept as one requirement.
