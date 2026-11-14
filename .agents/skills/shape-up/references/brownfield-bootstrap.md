# Brownfield context pack (optional)

EGM-inspired optional pack for repos that already have product code and need
enough context to **shape** — not to replace ASDD Discovery or the harness SoT
(`.harness/`).

## When to use

- First Shape Up pitch in a brownfield repo.
- Shaper lacks a shared map of actors, surfaces, and constraints.

## When **not** to use

- Harness missing → run `asdd init-flow` (or `asdd install`) first.
- One-file production fix → `asdd slice init <id> --hotfix` (skip pitch track).
- Pitch already `bet` → go to `product-delivery`, not this pack.

## What to gather (artifact-first)

Write `docs/pitches/<pitch-id>/context-pack.md` (or attach next to the brief) covering:

1. **Product one-liner** — what the system is for (quote README / steering if present).
2. **Primary actors** — who uses it day to day.
3. **Surfaces in play** — apps, APIs, jobs touched by the idea (paths or service names).
4. **Hard constraints** — compliance, tenancy, SLAs, no-gos already known.
5. **Evidence of friction** — tickets, metrics, or "none yet".

Stop when the shaper can fill a [`concepts-brief-template.md`](./concepts-brief-template.md)
or a pitch Problem/Appetite. Do not generate requirements, designs, or intents here.

## Relationship to the kit

| Need | Use |
|------|-----|
| Install harness + first lite slice | `asdd init-flow` |
| Vague idea → hypothesis | this pack → `concepts_brief` → shape-up Flow 1/3 |
| Bet pitch → codeable intents | `product-delivery` (intent fitness + Goldfish split) |
| Bug ≤1 file | `asdd slice init --hotfix` |

Build SoT stays under `.harness/`. This pack never becomes the source of truth for
implementation.
