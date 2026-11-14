# egm-shaping — Design

## What changes

| Path | Change |
|------|--------|
| `cli/skills/product-delivery/SKILL.md` | Intent fitness gate; scope-split review step; critique-first; unfit → no slice init |
| `cli/skills/product-delivery/contracts/scope-map.schema.yaml` | Optional `intent_fit` on scopes |
| `cli/skills/product-delivery/references/asdd-harness-handoff.md` | Fitness checklist before slice init; Discovery return path |
| `cli/skills/product-delivery/references/shape-up-input.md` | Tie map validation to fitness + review artifact |
| `cli/skills/product-delivery/references/scope-split-review.md` | **New** — Goldfish lenses + protocol |
| `cli/skills/product-delivery/examples/end-to-end-example.md` | Show review + intent_fit |
| `cli/skills/shape-up/SKILL.md` | concepts_brief + readiness; critique-first; Goldfish review note |
| `cli/skills/shape-up/references/flows.md` | Flow 4 → brief + readiness; Flow 2 critique-first |
| `cli/skills/shape-up/references/concepts-brief-template.md` | **New** — brief template |
| `cli/skills/shape-up/references/brownfield-bootstrap.md` | **New** — optional P4 pack (or under product-delivery) |
| `cli/skills/shape-up/references/pitch-template.md` | Optional pointer to concepts_brief when used |
| `.harness/steering/templates/intent.md` | Optional `## Intent fitness` stub for authors |
| `docs/PLAYBOOK.md` / `cli/README.md` | Short mention of fitness + Goldfish split |
| `docs/ASDD-ROADMAP.md` or short note | Track egm-shaping P0–P4 as shaping quality (optional) |

Mirrored copies under `.agents/skills/` and `.cursor/skills/` update via `asdd kit self` / install — **edit `cli/skills` only** in implementation.

## Domain terms

- **Elephant** — drafting pass with conversation history (pitch/map author).
- **Goldfish** — critique pass without that history; artifact-quoted only.
- **Intent fitness** — gate that a scope is one codeable ASDD slice (outcome + lite-fit + EARS + self-contained).
- **Lite-fit** — scope expected to ship as `asdd slice init` (lite) or `--hotfix`; otherwise record `--full` with reason or re-split.
- **Concepts brief** — half-shaped hypothesis artifact before a formal pitch.
- **Scope-split review** — multi-lens Goldfish critique of `scope-map.yaml`.

## Flow (target)

```text
Idea → [concepts_brief + readiness] → Pitch → Bet
     → Scope map (Elephant)
     → Scope-split review (Goldfish) + human picks
     → Intent fitness per scope
     → intent.md + slice init (fit only)
     → ASDD Discovery…
```

## ADRs

- **ADR (local):** EGM concepts are **protocol in skills/references**, not a new harness SoT and not Stop sensors.
- **ADR (local):** Fresh-context Goldfish is mandatory as *instruction*; parallel subagents are optional when the runtime allows.
- **ADR (local):** `intent_fit` is optional on the schema so existing maps remain valid; new maps from the skill must fill it.
- **ADR (local):** P4 bootstrap complements `asdd init-flow`; it does not scaffold slices or replace Discovery.
- **ADR (local):** No required new CLI in P0–P4; a future `asdd intent-fit` is nice-to-have only.

## Out of scope

- Cencosud presets, tracker MCP, converge/Stop changes, Tessl/spec-as-source.
- Replacing Shape Up methodology with EGM’s design-doc loop.
