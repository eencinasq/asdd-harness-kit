---
name: external-trackers
description: Handoff contract between Shape Up work recorded in an external tracker (Linear, Jira, GitHub Issues, or a manual pitch document) and ASDD + Harness execution. Defines how a bet pitch and its scopes in a tracker become intents, how agents trace them, and how status syncs back. Use when intent.md references an external source or when the squad needs to sync status back to a tracker.
---

# External Trackers — Shape Up → ASDD Handoff Contract

## Boundary rule

**Humans own shaping and betting.** Shapers write pitches; the betting table bets them for a cycle. The pitch, its betting decision, and optionally its scope map live in an external tracker (Linear, Jira, GitHub Issues) or a manual pitch document. There are no sprints, stories, or backlog: a tracker cycle or milestone holds the bet, and one issue per scope is optional.

**Agents own ASDD + Harness execution.** They read the tracker content, do not re-shape, and work within the appetite the betting table set.

The ASDD agents never run `shape-up`. A bet pitch is split into intents by `product-delivery` (one intent per scope) before `@asdd-discovery-agent` starts. If the pitch is missing, incomplete, or not bet: stop and ask the human.

---

## Required handoff fields

The tracker item (pitch issue, scope issue, or manual pitch doc) must contain:

| Field | Required | ASDD use |
|---|---|---|
| `source_pitch_id` | Yes | Traceability, session provenance |
| `source_scope_id` | Yes when the item is one scope | One scope = one slice = one `intent.md` |
| `title` | Yes | Slice name, intent.md heading |
| `problem` | Yes | intent.md Problem |
| `desired_outcome` | Yes | intent.md Desired Outcome (one observable result per scope) |
| `appetite` | Yes | intent.md Appetite — the bet's boundary, never an estimate |
| `cycle` | Yes | Cycle the pitch was bet for |
| `must_haves` | Yes | intent.md Must-have outcomes (EARS-style) |
| `nice_to_haves` | No | intent.md Nice-to-haves (~), cuttable |
| `no_gos` | Yes | intent.md No-gos — hard boundary |
| `rabbit_holes` | No | intent.md Rabbit holes, with the shapers' patch |
| `depends_on` | No | Other scopes that must finish first |
| `tracker_url` | Yes | Canonical URL — intent.md references this |
| `tracker_type` | Yes | `linear` \| `jira` \| `github` \| `manual` |
| `betting_state` | Yes | Only `bet` may enter ASDD. Others stop. |
| `assigned_team` | No | Team that took the bet, for session attribution |
| `tech_lead` | No | Escalation contact |

If any **required** field is missing, do not create a slice. Return a `handoff_incomplete` notice to the human.

---

## Tracker → ASDD mapping

```text
Tracker pitch (bet, cycle)
  ├── scope issue or scope map entry  → one slice, one intent.md
  │     ├── title            → intent.md heading / slice name
  │     ├── problem          → intent.md Problem
  │     ├── desired_outcome  → intent.md Desired Outcome
  │     ├── appetite, cycle  → intent.md Appetite, Source
  │     ├── must_haves       → intent.md Must-have outcomes (MH-NN)
  │     ├── nice_to_haves    → intent.md Nice-to-haves (~)
  │     ├── no_gos           → intent.md No-gos
  │     ├── rabbit_holes     → intent.md Rabbit holes
  │     └── depends_on       → intent.md Depends on
  └── tracker_url            → intent.md Source reference
```

A pitch with no scopes in the tracker is split by `product-delivery` first.

---

## Reading from trackers

### With MCP (preferred)

If the runtime exposes an MCP server for the tracker:

1. Read the pitch (and scope issues, if any) via MCP using `tracker_url` or `source_pitch_id`.
2. Extract the handoff fields above.
3. Write them into `intent.md` verbatim — do not paraphrase or expand.
4. Record the tracker read in the session log.

### Without MCP (fallback)

1. The human pastes the pitch into the prompt, or
2. The `intent.md` is written by hand before the session starts, or
3. The agent reads a local snapshot (e.g., `.harness/specs/<slice>/pitch.md`).

In all cases, the canonical source is the tracker. Local snapshots are secondary.

---

## Status sync (optional)

When the team wants the tracker to reflect ASDD progress:

| ASDD event | Tracker action |
|---|---|
| Slice created | Comment on the pitch or scope issue with the slice ID and intent.md path |
| Phase completed | Comment with the phase name and evidence summary |
| Feature passing | Tick the matching must-have in the scope issue |
| Slice completed | Close the scope issue |
| Dissent logged | Comment with the dissent note and severity |
| Appetite warning | Comment that the scope is at risk of not fitting the cycle (hill chart still uphill late in the cycle) |

Do not sync automatically unless the project binding explicitly enables it. Default: manual sync by the TL.

---

## Guardrails

- **Do not reshape.** If a must-have is unclear, flag it as `PENDING_DEFINITION` in the spec — do not rewrite the pitch.
- **Do not expand scope.** Nice-to-haves are cuttable. If must-haves finish early, ask the human before starting nice-to-haves.
- **Do not invent estimates.** The appetite is the betting table's boundary. Agents report progress against it (hill chart), not against estimates.
- **Respect no-gos.** A no-go is a hard boundary. Crossing it requires a new pitch and a new bet.

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
    "scope_id": "SCOPE-002",
    "cycle": "2026-C4",
    "assigned_by": "tech-lead-name",
    "appetite_weeks": 6
  }
}
```

This preserves traceability for the Knowledge Agent's cooldown analysis.
