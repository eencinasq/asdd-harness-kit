# Anti-pattern findings: spec-drift-apps

**Author:** asdd-pipeline (this session) · **Model/Tool:** claude-opus-5-5

Draft: `requirements.md` (REQ-001…004, AC-001…004).

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

Clean: REQ-002, REQ-003, REQ-004

- **AP-1, REQ-001 — not a violation.** `outputSchema` is an MCP protocol field; the problem itself names it (clients
  cannot type results without it). Counter-case: "results are typed" without the field would be untestable — rejected.
- **AP-5, REQ-001/003** — Universal by intent.

Score: 1.0
