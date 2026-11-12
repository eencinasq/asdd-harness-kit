# Anti-pattern findings: skills-spec

Draft: `.harness/specs/skills-spec/requirements.md` (REQ-001…006, AC-001…006). Glossary: `capability.md` (actors,
entities). Skill: `anti-pattern-detection`.

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

Clean: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006

## Matches judged not a violation

- **AP-1, REQ-006** — "`asdd kit skills-lint` … `npm test` shall run it". Names a command, but the problem itself names
  the kit's own tooling (the kit already gates on `npm test` and `asdd kit guidance`); the requirement is the behavior
  of that tool. Counter-case: a different runner would also satisfy the intent — rejected, the actor (kit maintainer)
  already uses `npm test` as the gate, so naming it pins the observable result.
- **AP-4, REQ-001** — "runnable checks". Defined by AC-001 and the sensor (S-006: a command in the gate), so measurable.
- **AP-5, REQ-001…005** — Universal requirements with no WHEN. They hold for every shipped skill at all times by intent;
  AC-001…005 give the trigger under which each is checked.
- **AP-3, REQ-002** — "the design agent". Named actor (`asdd-design-agent`), defined in the capability's actors.
- **AP-7** — one capability, 6 REQs, 6 ACs, 3 entities: under every limit.

## Not an anti-pattern, noted for validation

REQ-002 and REQ-003 each bundle several obligations (boundaries, tier, three owners; markers, codegraph, three
Prohibitions). AC-002 and AC-003 enumerate them, so each obligation is still testable.

Score: 1.0
