---
id: {{id}}
pattern: {{pattern}}
status: proposed
control: <path of the guide or sensor to change, e.g. .harness/steering/session-loop.md>
change: {{change}}
success: <measurable criterion, e.g. no recurrence of {{signature}} in the next 10 sessions>
decided_by:
applied_commit:
applied_at:
---

# {{id}} — <short title>

<!--
Contract (QG-LEARN-03 … QG-LEARN-06, checked by validators/learning.mjs):
- status: proposed → accepted | rejected → applied. Only the Tech Lead sets accepted, rejected, or applied, and fills decided_by.
- rejected is a recorded "won't fix"; it closes the pattern with the reason below.
- applied needs applied_commit: the commit that changes `control` (validated with git).
  applied_at is optional and defaults to that commit's date. asdd learn then marks the change
  ineffective if the signature recurs, or verified after the quiet window.
- change: add-guide | tighten-guide | add-sensor | tighten-sensor | loosen-sensor | remove-sensor | product-code
- control: an existing file — a row in .harness/steering/controls.md, a script, or product code for product-code.
-->

## Pattern

- **Pattern:** {{pattern}} (`{{signature}}`, {{kind}})
- **Occurrences:** {{occurrences}}
- **Slices:** {{slices}}

Evidence:

{{evidence}}

## Root cause

<Why the current guides and sensors let this happen. An escape means a guide did not steer the agent away; noise means a sensor fires without catching a real defect.>

## Change

<The exact change to the control named in `control`. Keep it to the smallest edit that addresses the root cause.>

## Success criterion

<Restate `success` and how it will be observed. asdd learn tracks recurrence of `{{signature}}` automatically.>

## Rollback

<How to undo the change if it causes regressions.>

## Decision

<Tech Lead: decision, date, and reason. Cite an ADR when one applies.>
