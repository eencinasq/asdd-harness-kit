# Shape Up Pitch Conversions

This reference defines the optional conversions produced from a canonical Shape Up pitch.

The canonical pitch remains the source artifact. Every conversion is derived, keeps provenance, and preserves the betting state. These formats are workflow agnostic and do not assume a specific project framework, repository layout, or ticket provider.

## Conversion modes

| Mode | Use when | Primary output |
|---|---|---|
| `share` | A team or decision maker needs a concise version | Shareable pitch |
| `scope_map` | The pitch must be split into independently finishable scopes | Scope map |
| `discovery` | Another workflow must investigate the problem | Discovery intake |
| `bundle` | A downstream workflow needs the full source context | Portable pitch bundle |

Choose one mode unless the caller explicitly requests several. If no mode is requested, return the canonical pitch only.

Shape Up has no epics, user stories, story points, sprints, or backlog. Work is a bet pitch, split into scopes; the building team owns the tasks inside each scope. To turn a bet pitch into ASDD slices (one `intent.md` per scope), use the `product-delivery` skill.

## Common provenance contract

Every derived artifact must include:

```yaml
source_pitch_id: PITCH-001
source_scope_id: SCOPE-001
derived_artifact_id: SCOPE-MAP-001
derived_from: PITCH-001
betting_state: ready_for_bet
derivation_status: DERIVED
```

Rules:

1. Keep the original pitch unchanged.
2. Preserve the problem, desired outcome, appetite, boundaries, must-haves, nice-to-haves, scopes, risks, and open questions that apply to the output.
3. Do not turn a rough solution into an unverified requirement.
4. Mark inferred details as `DERIVED`, `PROPOSED`, or `PENDING_DEFINITION`.
5. Preserve pitch and scope identifiers; generate local IDs only for derived artifacts.
6. Keep the betting state visible. A converted ticket is not automatically approved work.
7. If the conversion changes the problem, outcome, appetite, or boundaries, return `RE-SHAPING_REQUIRED`.

## Shareable pitch

Use this when the user wants a concise version for a team, product review, or decision meeting.

```markdown
# <Pitch title>

## Source
- Pitch ID: <PITCH-001>
- Status: <betting state>
- Appetite: <time boundary>

## The problem
<Actor, problem, evidence, and why it matters.>

## The outcome
<Observable result.>

## The rough solution
<Coherent direction in a few paragraphs.>

## Boundaries
- Must-have: <item>
- Nice-to-have: <item>
- No-go: <item>

## Scopes
- <SCOPE-001>: <outcome>

## Risks and rabbit holes
- <risk and de-risking action>

## Decision needed
<bet / needs_shaping / no_bet>
```

## Scope map

A scope is a slice of the project that can be built, integrated, and finished on its own — a piece the team can show working (Shape Up, chapter "Map the Scopes"). Split the pitch into as many scopes as it needs: one for a small, coherent pitch; several when the pitch has independent parts. Do not split by layer (UI, API, database); each scope cuts through every layer it touches.

```markdown
# Scope map: <pitch title>

## Provenance
- Source pitch: <PITCH-001>
- Betting state: <state>
- Appetite: <time boundary for the whole bet>

## Scopes
| Scope ID | Name | Outcome (what works when it is done) | Class | Depends on |
|---|---|---|---|---|
| SCOPE-001 | <short name> | <observable result> | must_have | — |
| SCOPE-002 | <short name> | <observable result> | nice_to_have (~) | SCOPE-001 |

## Per scope
### SCOPE-001 — <name>
- Must-haves: <items from the pitch that live in this scope>
- Nice-to-haves (~): <cuttable items>
- No-gos: <pitch no-gos that bound this scope>
- Rabbit holes: <risks from the pitch that touch this scope>
- Open questions: <PENDING_DEFINITION items>

## Unscoped pitch items
- <item the map could not place — resolve before handoff or return RE-SHAPING_REQUIRED>
```

Rules:

1. Every must-have and nice-to-have in the pitch lands in exactly one scope; nothing is dropped silently.
2. Each scope has one observable outcome a person can try when the scope is done.
3. `Class` is `must_have` or `nice_to_have`. Anything that does not fit the bet goes back to shaping (`reshape`); it is never parked in a backlog.
4. Add `depends_on` only when a scope cannot be finished before another one; prefer independent scopes.
5. The sum of all scopes fits the bet's appetite. If it does not, cut nice-to-haves or return `RE-SHAPING_REQUIRED`; never extend the appetite.
6. The building team may discover new scopes while working. A new scope that preserves the problem, outcome, appetite, and no-gos joins the map; anything else returns to shaping.

## Discovery intake

Use a discovery intake when another agent or workflow must investigate the idea before requirements or implementation are defined.

```markdown
# Discovery intake: <problem>

## Source pitch
- Pitch ID: <PITCH-001>
- Pitch status: <state>
- Appetite: <time boundary>

## Problem and affected actor
<Known context.>

## Desired outcome
<What should improve.>

## Evidence
- <evidence>

## Boundaries
- Must-haves: <items>
- Nice-to-haves: <items>
- No-gos: <items>

## Scopes and risks
- <scope or rabbit hole>

## Questions to investigate
- <question>

## Expected discovery output
<What the receiving workflow should return.>

## Current decision state
<betting state>
```

The receiving workflow owns its own terminology, schemas, gates, and repository paths. This conversion supplies a clean intake from the pitch.

## Portable pitch bundle

Use `bundle` when a downstream workflow needs the canonical pitch plus its decision context. The bundle is a logical artifact set; it may be represented as files, a ticket package, or a structured response.

```yaml
bundle_type: shape_up_pitch_bundle
bundle_version: "1.0"
pitch:
  id: PITCH-001
  source: <path, URL, or conversation reference>
  status: ready_for_bet
  appetite: <time boundary>
artifacts:
  canonical_pitch: <reference>
  betting_decision: <reference or PENDING_DEFINITION>
  scope_map: <reference or PENDING_DEFINITION>
  risk_notes: <reference or PENDING_DEFINITION>
conversions: []
```

When a conversion is created, append it to `conversions`:

```yaml
conversions:
  - id: SCOPE-MAP-001
    type: scope_map
    source_pitch_id: PITCH-001
    source_scope_ids: [SCOPE-001, SCOPE-002]
    status: derived
```

The bundle must not copy hidden context or pretend that a conversion is approved. It should contain only the pitch and explicitly derived artifacts.
