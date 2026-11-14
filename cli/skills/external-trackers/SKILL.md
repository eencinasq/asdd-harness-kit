---
name: external-trackers
description: >-
  Syncs a tracker pitch with the ASDD handoff. Use when an intent cites a tracker item. Do NOT use to split pitches —
  use product-delivery.
metadata:
  tier: leaf
---

# External Trackers — Shape Up ↔ ASDD handoff

**Humans own shaping and betting.** Shapers write pitches; the betting table bets them for a cycle; the pitch, its
betting decision, and optionally its scope map live in a tracker or a manual pitch document (a tracker cycle or
milestone holds the bet; one issue per scope is optional; there are no sprints, stories, or backlog). **Agents own ASDD
execution:** they read the tracker, do not re-shape, and work within the appetite. This skill is the only one that
reads from or writes to a tracker.

**Operational boundary:** reads tracker items (MCP or a pasted or local snapshot); writes
`docs/pitches/<pitch-id>/handoff.yaml`, the `source` block of a slice's first session, and — only when sync is enabled —
comments, ticks, and closes on the tracker items of this pitch. It never writes `intent.md` (that is
`product-delivery`) and never edits the pitch text in the tracker.

## Preconditions

- A tracker MCP server is configured for the tracker type ([`references/mcp-configurations.md`](./references/mcp-configurations.md)),
  or the human supplies the pitch (pasted, or a local snapshot such as `.harness/specs/<slice>/pitch.md`). The tracker
  stays canonical; snapshots are secondary.
- Status sync runs only when the project binding enables it or the Tech Lead asks (default: manual sync by the TL).

## Input / Output Contract

- **Inputs:** `tracker_ref` (`string`, a tracker URL or `source_pitch_id` / `source_scope_id`, required);
  `asdd_event` (`enum`, one of the Status sync events below, optional — only for sync).
- **Outputs:** `handoff` (`yaml`, the Required handoff fields below, written to `docs/pitches/<pitch-id>/handoff.yaml`);
  `session_source` (`json object`, the `source` block of the slice's `001` session); `tracker_update` (a tracker comment
  or state change, read back through the MCP).

## Required handoff fields

| Field | Required | ASDD use |
|---|---|---|
| `source_pitch_id` | Yes | Traceability, session provenance |
| `source_scope_id` | When the item is one scope | One scope = one slice = one `intent.md` |
| `title` | Yes | Slice name, intent heading |
| `problem` | Yes | intent Problem |
| `desired_outcome` | Yes | intent Desired Outcome (one observable result per scope) |
| `appetite` | Yes | intent Appetite — the bet's boundary, never an estimate |
| `cycle` | Yes | Cycle the pitch was bet for |
| `must_haves` | Yes | intent Must-have outcomes (EARS-style) |
| `nice_to_haves` | No | intent Nice-to-haves (~), cuttable |
| `no_gos` | Yes | intent No-gos — hard boundary |
| `rabbit_holes` | No | intent Rabbit holes, with the shapers' patch |
| `depends_on` | No | Other scopes that must finish first |
| `tracker_url` | Yes | Canonical URL the intent references |
| `tracker_type` | Yes | `linear` \| `jira` \| `github` \| `manual` |
| `betting_state` | Yes | Only `bet` may enter ASDD |
| `assigned_team` | No | Session attribution |
| `tech_lead` | No | Escalation contact |

## Execution Protocol

### Step 1: Read the tracker item

- **Action:** with an MCP server, read the pitch (and scope issues, if any) by `tracker_ref`; without one, take the
  pasted pitch or the local snapshot.
- **Target:** the tracker item.
- **Assertion:** the item's text is in hand, with its URL or snapshot path.

### Step 2: Extract the handoff fields

- **Action:** copy each field of the table verbatim (never paraphrase or expand). A required field that is missing
  makes the record `handoff_incomplete`; an unclear must-have is `PENDING_DEFINITION` (markers:
  `.harness/steering/skills.md`).
- **Target:** `docs/pitches/<pitch-id>/handoff.yaml`.
- **Assertion:** every required field is present, or the file says `status: handoff_incomplete` and lists the gaps.

### Step 3: Record provenance

- **Action:** when a slice is created from this item, give its `001` session a `source` block:
  `{"tracker_type", "tracker_url", "pitch_id", "scope_id", "cycle", "assigned_by", "appetite_weeks"}` (the Knowledge
  agent's cooldown analysis reads it).
- **Target:** `.harness/state/slices/<slice-id>/sessions/001-*.json`.
- **Assertion:** `asdd check` exits 0 with the block in place.

### Step 4: Sync status back (only when enabled)

- **Action:** first run `asdd tracker-sync --slice <id>` (add `--json` for the machine plan). It derives the outbound
  actions from sessions + `handoff.yaml` (slice created, phase completed, feature passing, slice DONE, dissent). Apply
  each action through the tracker MCP (comment / tick / close). Use `asdd tracker-sync --apply` only to store a **local
  receipt** under `.harness/state/tracker-sync/` after you performed the MCP writes — it does not call the tracker.
  Appetite warning (hill still uphill late) remains a manual comment when relevant.
- **Target:** the tracker item of this pitch or scope; optional local receipt.
- **Assertion:** reading the item back through the MCP shows the comment or state change; `asdd tracker-sync --json`
  lists the same event set.

Guardrails: do not reshape (flag `PENDING_DEFINITION`); do not expand scope (ask before starting nice-to-haves); do not
invent estimates (report progress against the appetite); a no-go is a hard boundary that needs a new pitch and bet.

## Verification Gate

1. `test -s docs/pitches/<pitch-id>/handoff.yaml` exits 0, and `grep -cE '^(source_pitch_id|title|problem|desired_outcome|appetite|cycle|must_haves|no_gos|tracker_url|tracker_type|betting_state):' docs/pitches/<pitch-id>/handoff.yaml`
   prints 11 — or the file says `status: handoff_incomplete`.
2. After Step 3: `asdd check` exits 0.
3. After Step 4: the MCP read-back of the item shows the update.
4. Negative check: `git status --porcelain -- .harness/specs` lists no `intent.md` this run wrote.

## Escalation Gate

HALT when a required field is missing (`handoff_incomplete`), when `betting_state` is not `bet`, or when the pitch is
missing or incomplete: do not create a slice; ask the human. HALT before any tracker write that sync is not enabled for.
Escalate as Context → Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `product-delivery`:** when `handoff.yaml` is complete and `betting_state` is `bet`; passes `handoff` as the
  `pitch` input.
- **redirect → `shape-up`:** when the tracker pitch is not bet or is missing an ingredient.
