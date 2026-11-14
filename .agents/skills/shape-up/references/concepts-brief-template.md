# Concepts brief template

Half-shaped hypothesis between a raw idea and a formal Shape Up pitch. Write to
`docs/pitches/<pitch-id>/concepts_brief.md` (create the pitch id when missing).
Do **not** set `betting_state: ready_for_bet` until the readiness gate passes and a
full pitch exists.

```markdown
# Concepts brief: <working title>

pitch_id: PITCH-NNN
brief_status: exploring   # exploring | ready_to_shape | parked

## Hypothesis
[One paragraph: who has what friction, and what rough change might help.]

## Who / when
[Named actor and situation — not "users" or "the business".]

## Evidence so far
[Tickets, metrics, interviews, or explicit "none yet".]

## Appetite guess
[Small batch / big batch / unknown — a guess, not a bet.]

## Open questions
- [ ] …
- [ ] …

## Readiness gate
| Question | Answer | decided_by |
|----------|--------|------------|
| Can we name specific friction? | yes / no / deferred: … | |
| Do we know who has it? | yes / no / deferred: … | |
| Is there any evidence it matters? | yes / no / deferred: … | |
| Are we shaping to learn or to ship? | learn / ship | |

brief_status becomes `ready_to_shape` only when the human accepts the gate
(or records explicit deferrals). Then continue to a full pitch via Flow 1 or 3.
`parked` means stop shaping and gather evidence — do not invent a pitch.
```

## Critique-first note

When reviewing a brief, start with the weakest readiness row. No empty praise.
