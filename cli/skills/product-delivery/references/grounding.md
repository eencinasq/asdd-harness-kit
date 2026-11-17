# Grounding — shape from what already exists

Grounding is mandatory before a pitch is written (`shape-up` Step 3) and before scopes are classified
(`product-delivery` Step 3). It lives in `product-delivery`, which owns the repository-facing contracts; `shape-up`
reads it at its installed path. Its purpose: reuse what the product already has, and set the appetite from what similar
work really took — never from a guess. It reads the repository; it writes nothing to it.

## Tools

Run them from the repository root. Each answers one question; record what it returned, not what you expected.

| Question | Command | What to take |
|---|---|---|
| Is there already a capability, requirement, or slice for this? | `asdd knowledge search "<terms of the problem>" --k 8` (run `asdd knowledge sync` first when it says there is no index; the index is a local cache, not a repository file) | Slice ids, `REQ-NNN` ids, the spec text that matches |
| What does that slice cover, and how big was it? | `asdd knowledge slice <slice-id>` | Its requirements and its number of features |
| How does a requirement trace to code and tests? | `asdd knowledge trace req:<slice-id>:REQ-NNN` | Features, scope paths, tests |
| Which components would the change touch? | `codegraph explore "<surface, symbol, or file names>"` | File paths and symbols to reuse or extend |
| Which finished slices are similar in shape? | `.harness/PROGRESS.md` (or `.harness/state/registry.json`) for slices with status `DONE`, then `asdd knowledge slice <id>` for each candidate | DONE slices whose outcome and surfaces resemble this one, with their feature counts |

With MCP hosts, the `knowledge` server's `knowledge_search`, `knowledge_slice`, `knowledge_trace`, and
`pipeline_status` tools answer the same questions.

When a tool cannot run (no index, no codegraph), do not fill the gap from memory: mark the row's evidence
`PENDING_DEFINITION` (markers: `.harness/steering/skills.md`). A pitch with a `PENDING_DEFINITION` grounding row cannot
reach `ready_for_bet`, and a scope with one cannot be `fit`.

## The grounding table

Same grammar as the tracker Intent item (`.agents/skills/external-trackers/references/intent-format.md`), so a
grounded pitch, a grounded scope, and an imported intent are checked by the same rules:

```markdown
## Grounding

| Kind | What | Evidence |
|---|---|---|
| Reuse | Card tokenization service | REQ:payments-tokenize/REQ-003, path:src/payments/tokenize.ts |
| Extend | Checkout payment step: add "saved card" option | slice:checkout-v2, path:src/checkout/PaymentStep.tsx |
| New | Saved-cards list in the account page — nothing similar exists | none |
```

- `Kind` is `Reuse` (use as is), `Extend` (change something that exists), or `New` (nothing similar exists).
- `Evidence` is a comma-separated list of `REQ:<slice-id>/REQ-NNN`, `slice:<slice-id>`, `path:<repo-path>`
  (optional `#L<n>` or `#<symbol>`), or `none` — `none` only on `New` rows, and the `What` cell says what was searched.
- Every `Reuse` and `Extend` row cites at least one ref that exists today.
- A `New` row that matches an existing capability is a finding: change it to `Reuse` or `Extend`, or say in `What`
  why the existing one does not fit.

## Reference slices (appetite)

The appetite is a boundary, not an estimate — but it is set knowing what similar work took. Under the pitch's
`## Appetite`, add one line per reference slice:

```markdown
## Appetite

Small batch: 2 weeks.

Reference slices (DONE, similar shape):
- checkout-v2: 6 features
- payments-tokenize: 3 features
```

Pick DONE slices whose outcome and touched surfaces resemble the pitch (from the grounding table's `slice:` refs first,
then from `.harness/PROGRESS.md`). When none exists, write `Reference slices: none — <what was searched>`. An appetite
far above its reference slices for a similar number of `Reuse`/`Extend` rows is a rabbit-hole question for the
review, not a reason to raise it.
