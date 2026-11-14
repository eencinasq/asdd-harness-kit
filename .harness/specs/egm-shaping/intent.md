# Intent: egm-shaping

> One intent = one scope of a bet Shape Up pitch = one ASDD slice. Written by the `product-delivery` skill (or by hand), then handed to `@asdd-discovery-agent`.
> Work outside a pitch (a cooldown fix, a bug) writes `Source: ad-hoc (cooldown)` and skips the pitch fields.

## Source

- **Pitch ID:** ad-hoc (cooldown) — EGM × Shape Up / Product Delivery analysis
- **Scope ID:** n/a — kit improvement track
- **Scope map:** n/a
- **Betting state:** ad-hoc
- **Cycle:** kit 3.x cooldown
- **Scope class:** must_have
- **Tracker URL:** n/a

**Rule:** Only a `bet` pitch enters ASDD. For any other state, stop and ask the human.

---

## Problem

Shape Up and Product Delivery already act as PO/PM (pitch → scopes → intents), but the split into **codeable** intents depends on the same long-context agent that drafted the map (Elephant bias). Soft “scope too big” signals do not enforce **lite-fit**, fresh-context critique, or a pre-pitch concept brief. ASDD then inherits intents that are too fat or under-specified.

## Desired Outcome

When a team shapes and splits a bet pitch with this kit, every kept scope passes an **intent fitness** gate (one outcome, lite-fit or explicit `--full`/re-split), a **Goldfish** multi-lens critique of the scope map, and optional **concepts_brief** readiness before betting — so Discovery receives small, self-contained intents without moving the build SoT out of `.harness/`.

## Appetite

One focused kit slice covering EGM concept ports P0→P4 (skills, schemas, references, light CLI/docs). No new SoT; no merge of Elephant/Goldfish into Stop/CI sensors.

## Must-have outcomes

- **MH-01:** When Product Delivery validates a scope map, the skill shall require an **intent fitness** record per kept scope (one observable outcome, lite-fit or explicit escalate/re-split, EARS-ready must-haves, self-contained intent) before `asdd slice init`.
- **MH-02:** When the scope map is proposed, Product Delivery shall run a **Goldfish / multi-lens scope-split review** (artifact-first, critique-first) and record human accept/ignore before writing intents.
- **MH-03:** When Shape Up runs Flow 4 (Explore) or moves a vague idea toward a pitch, the skill shall support a **`concepts_brief.md`** plus a **readiness gate** before formal pitch / `ready_for_bet`.
- **MH-04:** When Shape Up or Product Delivery reviews a pitch or scope map, the skill text shall enforce **critique-first / no-glazing** language (weakest point first; no empty praise).
- **MH-05:** When a brownfield repo needs product context before shaping, the kit shall offer an **optional EGM-inspired bootstrap** reference that complements `asdd init-flow` and does not replace Discovery or `.harness/` SoT.

## Nice-to-haves (~)

- CLI helper to print intent-fit / scope-split checklist status (`asdd intent-fit` or similar).
- Parallel subagent recipe when the runtime supports it; otherwise same-agent fresh-context protocol is enough.

## No-gos

- Do not make Goldfish a Stop/CI sensor or replace DRIFT/converge.
- Do not move build SoT to `docs/designs/` or EGM-style design trees.
- Do not replace Shape Up appetite/bet/circuit breaker with an “EGM core loop.”
- Do not require subagents; checklist + artifact protocol must work single-agent.

## Rabbit holes

- Skill copies live under `cli/skills/` and are mirrored into `.agents/` / `.cursor/` via kit self/install — edit **cli/skills** as source of truth.
- Schema changes to `scope-map.schema.yaml` must stay backward-compatible (optional fields).

## Actors

- **PO/shaper:** uses shape-up (brief → pitch → bet).
- **PM/delivery:** uses product-delivery (map → goldfish → fit intents → slices).
- **ASDD Discovery:** consumes fit intents only; returns unfit work upstream.

## Depends on

- none (builds on existing shape-up + product-delivery skills)

## Open questions

- none for P0–P4 scope; CLI helper is optional (~).
