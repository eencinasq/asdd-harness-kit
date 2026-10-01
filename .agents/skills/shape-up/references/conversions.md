# Shape Up Pitch Conversions

This reference defines the optional conversions produced from a canonical Shape Up pitch.

The canonical pitch remains the source artifact. Every conversion is derived, keeps provenance, and preserves the betting state. These formats are workflow agnostic and do not assume a specific project framework, repository layout, or ticket provider.

## Conversion modes

| Mode | Use when | Primary output |
|---|---|---|
| `share` | A team or decision maker needs a concise version | Shareable pitch |
| `epic` | The pitch contains several independent scopes or outcomes | Epic with scope index |
| `story` | One actor has one coherent outcome | User story |
| `task` | One concrete action is needed | Task |
| `discovery` | Another workflow must investigate the problem | Discovery intake |
| `bundle` | A downstream workflow needs the full source context | Portable pitch bundle |

Choose one mode unless the caller explicitly requests several. If no mode is requested, return the canonical pitch only.

## Common provenance contract

Every derived artifact must include:

```yaml
source_pitch_id: PITCH-001
source_scope_id: SCOPE-001
derived_artifact_id: STORY-001
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
- Status: <proposed state>
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
<bet / needs_shaping / no_bet / parked / abandoned>
```

## Epic

Use an epic when the pitch represents one meaningful outcome with multiple independent scopes, actors, or workflows.

```markdown
# Epic: <outcome>

## Provenance
- Epic ID: <EPIC-001>
- Source pitch: <PITCH-001>
- Betting state: <state>
- Appetite: <time boundary>

## Problem and desired outcome
<Condensed pitch context.>

## Boundaries
- Must-haves: <items>
- Nice-to-haves: <items>
- No-gos: <items>

## Child stories or scopes
| ID | Type | Title | Source scope | Classification |
|---|---|---|---|---|
| <STORY-001> | story | <title> | <SCOPE-001> | must_have |

## Relations and dependencies
- <artifact> `derived_from` <source artifact>
- <artifact> `depends_on` <prerequisite> — <reason>

## Open decisions
- <question>
```

Create child stories only for independently valuable outcomes or scopes. Do not create a story merely to populate the epic.

## User story

Use a user story for one specific actor and one observable outcome.

```markdown
# User story: <short title>

## Provenance
- Story ID: <STORY-001>
- Source pitch: <PITCH-001>
- Source scope: <SCOPE-001>
- Parent epic: <EPIC-001>
- Classification: must_have | nice_to_have | proposed

## Story
As a <specific actor>,
I want <observable outcome>,
so that <value>.

## Acceptance boundary
- <observable behavior>
- <observable behavior>

## Relations
- derived_from: <source scope>
- relates_to: <story or task>

## Dependencies
- depends_on: <artifact> — <reason>

## Out of scope
- <explicit exclusion>

## Pending definitions
- <question>
```

Do not invent acceptance details that the pitch does not support. Mark them `PENDING_DEFINITION` or leave them for the receiving discovery workflow.

## Task

Use a task for one concrete action that supports shaping, validation, design, implementation, verification, or release.

```markdown
# Task: <verb-led action>

## Provenance
- Task ID: <TASK-001>
- Source pitch: <PITCH-001>
- Source story or scope: <STORY-001 or SCOPE-001>
- Type: discovery | validation | design | implementation | verification | release

## Action
<One concrete action.>

## Purpose
<Risk, scope, or outcome supported by the action.>

## Completion signal
<Observable result or artifact.>

## Dependencies
- depends_on: <artifact> — <reason>

## Open questions
- <question>
```

A task must not hide a new capability or material scope change. If it does, return to shaping.

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
  - id: EPIC-001
    type: epic
    source_pitch_id: PITCH-001
    source_scope_ids: [SCOPE-001, SCOPE-002]
    status: derived
```

The bundle must not copy hidden context or pretend that a conversion is approved. It should contain only the pitch and explicitly derived artifacts.
