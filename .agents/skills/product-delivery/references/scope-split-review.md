# Scope-split review (Goldfish)

Critique the **scope map artifact**, not the chat that drafted it. The drafting pass is the Elephant; this review is the **Goldfish**: quote the map, ignore conversation history, start with the weakest point (**critique-first / no-glazing**).

Write findings to `docs/pitches/<pitch-id>/scope-split-review.md`. Do not invent scopes here — only stress-test the split. A human accepts or ignores each material finding (`decided_by`) before intents are written.

## When to run

After the scope map exists and Step 4 map checks have a draft answer; **before** writing `intent.md` or running `asdd slice init`.

## Fresh-context protocol

1. Open only: the pitch file, `scope-map.yaml`, and this reference (no prior chat summary).
2. If the runtime supports a separate subagent or a new session, use it. If not, simulate Goldfish: discard drafting rationale and judge only what the YAML and pitch text say.
3. Parallel subagents (optional): one lens per subagent; merge into one review table. Subagents are never required.

## Lenses (all required)

| Lens | Fail when… | Fix direction |
|------|------------|---------------|
| **Appetite fit** | Kept scopes cannot fit the bet's appetite even after cutting `~` | Cut nice-to-haves, reshape, or `RE-SHAPING_REQUIRED` |
| **One demoable outcome** | A scope has two tryable results, or none | Split or merge |
| **ASDD lite-fit** | Scope looks cross-module / multi-week without an explicit `--full` or re-split decision | Re-split, record `intent_fit.lite_fit: false` + `decided_by` for `--full`, or reshape |
| **No-gos & deps** | A scope crosses a no-go, or `depends_on` forms a cycle / fake ordering | Fix map; cycles block handoff |
| **Gaps** | A pitch must-have is unplaced, or an outcome needs an unspoken prerequisite | Place item, add scope, or `PENDING_DEFINITION` / blocked |

## Review artifact shape

```markdown
# Scope-split review — <pitch-id>

Critique-first: [one sentence naming the weakest point in the split]

| Lens | Verdict | Evidence (quote map or pitch) | Fix | Human (`decided_by`) |
|------|---------|-------------------------------|-----|----------------------|
| Appetite fit | pass \| fail | "…" | … | accept \| ignore — who |
| One demoable outcome | … | … | … | … |
| ASDD lite-fit | … | … | … | … |
| No-gos & deps | … | … | … | … |
| Gaps | … | … | … | … |

Status: ready_for_intents | blocked
```

Empty praise ("looks solid", "great split") is not a verdict. A pass row still needs a quote.

## Gate

- Every lens has a row with evidence.
- Every **fail** is either fixed in the map or explicitly ignored by a human (`decided_by`).
- `Status: ready_for_intents` only when no unresolved fail remains.
- Then run **intent fitness** per kept scope ([`asdd-harness-handoff.md`](./asdd-harness-handoff.md)) before `asdd slice init`.
