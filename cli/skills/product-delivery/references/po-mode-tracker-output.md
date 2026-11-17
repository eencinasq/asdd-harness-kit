# PO mode — tracker output

In PO mode a PO/PM shapes and splits from Claude Desktop (Code tab), claude.ai/code, or an IDE, usually as the
`asdd-shaping-agent`. The repository is evidence only: **nothing is written to it**. Every artifact goes to the tracker
named by the `tracker` block of `.harness/config/project.json` (`type`: `jira`, `linear`, or `github`). Engineers then
import each Intent item with `asdd intake` and work in their own repository with the harness.

PO mode applies when `project.json` has a `tracker` block **and** the session is a PO/PM session (the
`asdd-shaping-agent`, or the user says so). Without a `tracker` block, PO mode stops: ask for the block
(`asdd check-config` validates it) instead of guessing a tracker.

## Where each artifact goes

| Artifact | Repo mode (engineer) | PO mode (tracker) |
|---|---|---|
| Pitch (with `## Grounding`, reference slices) | `docs/pitches/<pitch-id>/pitch.md` | Body of the **pitch item** (`tracker.pitch`) |
| Pitch review (`review.md`) | `docs/pitches/<pitch-id>/review.md` | Comment on the pitch item |
| Betting decision (`betting_state`, cycle, `decided_by`) | Lines in `pitch.md` | Update the pitch body's `betting_state:` line, plus a comment with cycle and `decided_by` |
| Scope map, scope grounding, scope-split review | `docs/pitches/<pitch-id>/*.{yaml,md}` | One comment on the pitch item each (the scope map as a fenced `yaml` block) |
| One intent per **fit** scope | `.harness/specs/<slice-id>/intent.md` + `asdd slice init` | One **Intent item** per fit scope, child of the pitch, body in the canonical format of `.agents/skills/external-trackers/references/intent-format.md` |

PO mode never runs `asdd slice init`, never writes `.harness/`, and never writes `docs/pitches/`. The only local write
it may cause is the knowledge index cache (`asdd knowledge sync`, `.harness/knowledge/`, gitignored).

## Tracker operations

Tool names are those of the servers in `.agents/skills/external-trackers/references/mcp-configurations.md`. Another
server for the same tracker exposes the same operations under its own names (for example the hosted Atlassian
connector in Claude Desktop: `createJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`).

| Operation | Jira (`mcp-atlassian`) | Linear (`@smithery/linear-mcp`) | GitHub (`@github/mcp-server`) |
|---|---|---|---|
| Find an existing pitch or Intent item | `jira_search` (JQL on project + type/label) | `linear_searchIssues` | `search_issues` (repo + label) |
| Create the pitch item | `jira_create_issue` (type `tracker.pitch.issue_type`) | `linear_createProject` (`container: project`) or `linear_createIssue` with `tracker.pitch.label` | `create_issue` with `tracker.pitch.label` |
| Update a body (pitch `betting_state`, an Intent item) | `jira_update_issue` | `linear_updateIssue` | `update_issue` |
| Comment (review, decision, scope map) | `jira_add_comment` | `linear_createIssueComment` | `create_issue_comment` |
| Create an Intent item under the pitch | `jira_create_issue` with type `tracker.intent.issue_type` and/or label `tracker.intent.label`, parent = the pitch | `linear_createIssue` with `tracker.intent.label`, in the pitch project (or `parentId` = the pitch issue) | `create_issue` with `tracker.intent.label`, then `add_sub_issue` under the pitch |

Before creating, search for an item of the same `scope_id` under the pitch: update it instead of creating a duplicate.
After creating or updating, read the item back (`jira_get_issue`, `linear_getIssue`, `get_issue`) and confirm the
body still starts with the `asdd-intent` fence and keeps every required heading — some trackers rewrite Markdown.

## Intent item checks (before creating it)

1. The fenced `asdd-intent` block has every required key, `betting_state: bet`, and `slice_id` in
   `^[a-z0-9][a-z0-9_-]*$`.
2. The seven required headings exist: `## Problem`, `## Desired Outcome`, `## Appetite`, `## Must-have outcomes`,
   `## No-gos`, `## Grounding`, `## Intent fitness` (with `status` `fit`).
3. The grounding table is the scope's table from Step 3; every `Reuse` and `Extend` row cites a ref that exists today
   (`asdd knowledge slice`, `codegraph explore`, or the path in the working tree).
4. `reference_slices` names DONE slices of similar shape (or `none`, explained under `## Appetite`).

`asdd intake` repeats checks 1–3 on the engineer's machine; an item that fails them is refused there.

## Example Intent body

~~~markdown
```asdd-intent
intent_format: 1
slice_id: checkout-saved-cards
mode: lite
pitch: PROD-120
scope_id: SCOPE-02
betting_state: bet
cycle: 2026-C4
appetite: 6 weeks for the whole pitch
reference_slices: checkout-v2
decided_by: maria.po
depends_on: none
```

## Problem

Returning customers retype their card at every checkout and abandon on mobile.

## Desired Outcome

A returning customer pays with a saved card in one tap at checkout.

## Appetite

6 weeks for the whole pitch (shared by every scope).

- checkout-v2: 6 features

## Must-have outcomes

- **MH-01:** When a returning customer reaches the payment step, the checkout shall list the customer's saved cards.
- **MH-02:** When the customer picks a saved card, the checkout shall charge it without asking for the card number.

## No-gos

- No new payment provider; no card management outside checkout.

## Grounding

| Kind | What | Evidence |
|---|---|---|
| Reuse | Card tokenization service | REQ:payments-tokenize/REQ-003, path:src/payments/tokenize.ts |
| Extend | Checkout payment step: add a saved-card option | slice:checkout-v2, path:src/checkout/PaymentStep.tsx |
| New | Saved-card picker component — no list-of-cards component exists | none |

## Intent fitness

- **one_outcome:** yes
- **lite_fit:** yes
- **ears_ready:** yes
- **self_contained:** yes
- **status:** fit
- **decided_by:** maria.po
~~~
