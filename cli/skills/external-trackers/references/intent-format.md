# Intent item format (tracker)

One **Intent item** = one scope of a bet pitch = one future ASDD slice. The PO/PM writes it in the project's tracker
(`tracker` in `.harness/config/project.json`); an engineer imports it with `asdd intake` and works on it with the
harness. The body is the `intent.md` template content (`.harness/steering/templates/intent.md`), plus a machine block
and a grounding table, so `asdd intake` can validate it without a model and write `intent.md` verbatim.

## Body

The item body (Jira description, Linear description, GitHub issue body) is Markdown with, in this order:

1. one fenced block whose info string is `asdd-intent` (the **intent block**);
2. the sections below, as level-2 headings with exactly these names.

### Intent block

One `key: value` per line; no nesting, no quotes needed. Keys are lowercase; unknown keys are ignored with a warning.

```asdd-intent
intent_format: 1
slice_id: checkout-saved-cards
mode: lite
pitch: PROD-120
scope_id: SCOPE-02
betting_state: bet
cycle: 2026-C4
appetite: 6 weeks for the whole pitch
reference_slices: payments-tokenize, checkout-v2
decided_by: maria.po
depends_on: none
```

| Key | Required | Value |
|---|---|---|
| `intent_format` | Yes | `1` |
| `slice_id` | Yes | Suggested slice id, `^[a-z0-9][a-z0-9_-]*$` |
| `mode` | Yes | `hotfix` \| `lite` \| `full` — the `asdd slice init` preset |
| `pitch` | Yes | The parent pitch: Jira key, Linear project or issue URL, or GitHub `#number` |
| `scope_id` | Yes | Scope id from the scope map (`SCOPE-NN`) |
| `betting_state` | Yes | `bet` — any other value is refused at intake |
| `cycle` | Yes | Cycle the pitch was bet for |
| `appetite` | Yes | The bet's boundary (shared by every scope), never an estimate |
| `reference_slices` | Yes | Comma-separated DONE slice ids of similar shape, or `none` (then `## Appetite` says why) |
| `decided_by` | Yes | Who confirmed the intent fitness |
| `depends_on` | No | Comma-separated Intent item keys or slice ids, or `none` |

### Sections

Required, exact headings (any order after the intent block):

| Heading | Content |
|---|---|
| `## Problem` | The part of the pitch's problem this scope solves: who has it, when |
| `## Desired Outcome` | The one observable result a person can try when the scope is done |
| `## Appetite` | The boundary, and per reference slice one line `- <slice-id>: <n> features` (or why there is none) |
| `## Must-have outcomes` | At least one `- **MH-NN:** When …, the … shall …` line (EARS-style) |
| `## No-gos` | Explicit exclusions |
| `## Grounding` | The grounding table (below) |
| `## Intent fitness` | The template's bullets: `one_outcome`, `lite_fit`, `ears_ready`, `self_contained`, `status`, `decided_by`; `status` must be `fit` |

Optional headings, copied when present: `## Nice-to-haves (~)`, `## Rabbit holes`, `## Actors`, `## Depends on`,
`## Open questions`. `## Source` is not written by the PO: `asdd intake` builds it from the intent block and the item URL.

### Grounding table

What the scope reuses, extends, or adds, each row backed by evidence from the repository at shaping time.

```markdown
## Grounding

| Kind | What | Evidence |
|---|---|---|
| Reuse | Card tokenization service | REQ:payments-tokenize/REQ-003, path:src/payments/tokenize.ts |
| Extend | Checkout payment step: add "saved card" option | slice:checkout-v2, path:src/checkout/PaymentStep.tsx |
| New | Saved-cards list in the account page — nothing similar exists | none |
```

- Header exactly `| Kind | What | Evidence |`; at least one row.
- `Kind` is `Reuse`, `Extend`, or `New`.
- `Evidence` is a comma-separated list of refs:

| Ref | Means | Resolves when (checked by `asdd intake`) |
|---|---|---|
| `REQ:<slice-id>/REQ-NNN` | A requirement of an existing slice | the slice's `requirements.md` or `spec.md` names `REQ-NNN` |
| `slice:<slice-id>` | An existing slice | `.harness/state/slices/<slice-id>/` exists |
| `path:<repo-path>` | A file or directory (optional `#L<n>` or `#<symbol>` suffix, ignored when resolving) | the path exists in the working tree |
| `none` | No evidence | allowed only on `New` rows; the `What` cell says why |

`Reuse` and `Extend` rows need at least one ref other than `none`. A scope that only re-creates something a `Reuse`
row could cover is merged or cut during shaping, not imported.

## Per tracker

Item identification and fields come from the `tracker` block of `project.json`. Tool names are those of the MCP
servers in [`mcp-configurations.md`](./mcp-configurations.md); another server for the same tracker exposes the same
operations under its own names.

### Jira

| | |
|---|---|
| Pitch | Issue of type `tracker.pitch.issue_type` (e.g. `Epic`) in project `tracker.project` on `tracker.site` |
| Intent item | Issue of type `tracker.intent.issue_type` and/or with label `tracker.intent.label`, **Parent** = the pitch |
| Body field | Description (Markdown; keep the `asdd-intent` fence intact) |
| Read back | `jira_get_issue` (key, e.g. `PROD-131`) |
| Progress back | `jira_add_comment` (`asdd tracker-sync` plan, then the agent posts) |

### Linear

| | |
|---|---|
| Pitch | `tracker.pitch.container: project` → a Linear project; `issue` → an issue labelled `tracker.pitch.label` |
| Intent item | Issue in team `tracker.project` labelled `tracker.intent.label`, in the pitch project (or a sub-issue of the pitch issue) |
| Body field | Description |
| Read back | `linear_getIssue` (identifier, e.g. `ENG-412`) |
| Progress back | `linear_createIssueComment` |

### GitHub

| | |
|---|---|
| Pitch | Issue in `tracker.project` (`owner/repo`) labelled `tracker.pitch.label` |
| Intent item | Issue labelled `tracker.intent.label`, added as a sub-issue of the pitch (the intent block's `pitch: #<n>` also links it) |
| Body field | Issue body |
| Read back | `get_issue` (repo + number) |
| Progress back | `create_issue_comment`; `update_issue` for labels or state |

## Intake

The engineer's agent reads the item with the read-back tool and passes the body to `asdd intake --from <file|-> --ref <url>`
(slice `intent-intake`), which validates this format, writes `.harness/specs/<slice_id>/intent.md`, runs
`asdd slice init` with `mode`, records the item URL as the slice source, and re-checks every grounding ref against the
current code.
