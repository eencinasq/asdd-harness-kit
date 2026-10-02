---
name: external-trackers
description: Handoff contract between human-driven Product Delivery (Shape Up + sprint planning in external trackers) and ASDD + Harness agent execution. Defines how agents read, reference, and trace work that originates in Linear, Jira, GitHub Issues, or manual pitch documents. Use when intent.md references an external source or when the squad needs to sync status back to a tracker.
---

# External Trackers — ASDD Handoff Contract

## Boundary rule

**Humans own Shape Up + Product Delivery.** The Product Owner, Tech Lead, and Architect bet pitches, write stories, and plan sprints in meetings. The output lives in an external tracker (Linear, Jira, GitHub Issues) or a manual pitch document.

**Agents own ASDD + Harness execution.** They read the tracker content, do not re-shape, and execute within the timebox the humans defined.

Never run `shape-up` or `product-delivery` skills during an ASDD session. If the pitch is missing, incomplete, or unbet: stop and ask the human to route it back to the PO/TL.

---

## Required handoff fields

The tracker issue (or manual pitch doc) that the TL assigns to the squad must contain:

| Field | Required | ASDD use |
|---|---|---|
| `source_pitch_id` | Yes | Traceability, slice naming, session provenance |
| `title` | Yes | Slice title, intent.md heading |
| `problem` | Yes | Discovery input, intent.md Problem section |
| `desired_outcome` | Yes | Discovery input, intent.md Desired Outcome section |
| `appetite` / `timebox` | Yes | Sprint boundary, warning threshold if exceeded |
| `must_haves` | Yes | Required scope — agents must deliver these |
| `nice_to_haves` | No | Cuttable scope — agents may skip if timebox tightens |
| `no_gos` | Yes | Negative constraints — agents must not cross these |
| `acceptance_criteria` | Yes | Spec input, EARS requirements source |
| `dependencies` | Yes | Task planning, wave sequencing |
| `story_ids` | No | Traceability to upstream stories |
| `epic_id` | No | Parent epic reference |
| `tracker_url` | Yes | Canonical URL — intent.md references this |
| `tracker_type` | Yes | `linear` \| `jira` \| `github` \| `manual` |
| `betting_state` | Yes | Only `bet` may enter ASDD. Others stop. |
| `assigned_squad` | No | Squad or team name for session attribution |
| `tech_lead` | No | Escalation contact |

If any **required** field is missing, do not create a slice. Return a `handoff_incomplete` notice to the human.

---

## Tracker → ASDD mapping

```text
Tracker Issue / Pitch Doc
  ├── source_pitch_id  → slice_id prefix (e.g., SLICE-<pitch-id>)
  ├── title            → intent.md heading
  ├── problem          → intent.md Problem
  ├── desired_outcome  → intent.md Desired Outcome
  ├── appetite         → intent.md Appetite
  ├── must_haves       → intent.md Boundaries (required)
  ├── nice_to_haves    → intent.md Boundaries (optional)
  ├── no_gos           → intent.md Boundaries (excluded)
  ├── acceptance_criteria → Spec input (EARS requirements)
  ├── dependencies     → tasks.md wave sequencing
  └── tracker_url      → intent.md Source reference
```

---

## Reading from trackers

### With MCP (preferred)

If the runtime exposes an MCP server for the tracker:

1. Read the issue/epic via MCP using `tracker_url` or `source_pitch_id`.
2. Extract the handoff fields above.
3. Write them into `intent.md` verbatim — do not paraphrase or expand.
4. Record the tracker read in the session log.

### Without MCP (fallback)

If no MCP is available:

1. The human pastes the issue body into the prompt, or
2. The `intent.md` is written manually by the TL before the session starts, or
3. The agent reads a local snapshot (e.g., `.harness/specs/<slice>/delivery/pitch.md`).

In all cases, the canonical source is the tracker. Local snapshots are secondary.

---

## Status sync (optional)

When the squad wants the tracker to reflect ASDD progress:

| ASDD event | Tracker action |
|---|---|
| Slice created | Add comment with slice ID and intent.md path |
| Phase completed | Add comment with phase name and evidence summary |
| Feature passing | Update linked issue checklist item |
| Slice completed | Close issue or move to "Done" column |
| Dissent logged | Add comment with dissent note and severity |
| Timebox warning | Add comment warning appetite exceeded |

Do not sync automatically unless the project binding explicitly enables it. Default: manual sync by the TL.

---

## Guardrails

- **Do not reshape.** If the acceptance criteria are unclear, flag as `PENDING_DEFINITION` in the spec — do not rewrite the story.
- **Do not expand scope.** Nice-to-haves are cuttable. If the agent finishes must-haves early, ask the human before starting nice-to-haves.
- **Do not invent estimates.** The appetite is the human's timebox. The agent reports progress against it, not against fabricated estimates.
- **Respect no-gos.** A no-go in the tracker is a hard boundary. Crossing it requires a new pitch and a new bet.

---

## Session provenance

When writing the initial session file for a slice that came from a tracker:

```json
{
  "event_type": "phase_started",
  "phase": "discovery",
  "source": {
    "tracker_type": "linear",
    "tracker_url": "https://linear.app/...",
    "pitch_id": "PITCH-042",
    "epic_id": "EPIC-007",
    "assigned_by": "tech-lead-name",
    "timebox_weeks": 2
  }
}
```

This preserves traceability for the Knowledge Agent and squad retrospectives.
