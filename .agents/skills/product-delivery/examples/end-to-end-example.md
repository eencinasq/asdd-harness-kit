# End-to-End Example: Pitch → Scopes → Intents → ASDD

```text
PITCH-014 (bet, six weeks)
  → scope map: SCOPE-001 (must_have), SCOPE-002 (nice_to_have ~)
  → intents: orders-quick-reorder, orders-reorder-edit
  → @asdd-discovery-agent per intent → ASDD pipeline per slice
```

## 1. Bet pitch (from `shape-up`)

```markdown
# Pitch: Reorder in one tap
- Pitch ID: PITCH-014
- Betting state: bet (cycle 2026-C4)
- Appetite: six weeks

Problem: Returning customers rebuild the same cart by hand every week; support
logs show 30% of "where is my old order" tickets are people trying to repeat it.

Solution (breadboard): Orders page → "Reorder" button per past order → cart
pre-filled → existing checkout. Optional: edit quantities before adding.

Must-haves: reorder a past order into the cart; skip items no longer sold and say so.
Nice-to-haves (~): edit quantities in a review step before adding to the cart.
No-gos: no subscriptions or scheduled reorders; no changes to checkout.
Rabbit holes: price changes since the original order — patched: always use the
current price and show it in the cart.
```

`jev_shape_up_gates` passed when the pitch was shaped.

## 2. Scope map

Two parts can be finished and tried separately: reordering works without the edit step, so they are two scopes.

```yaml
artifact: { type: scope_map, id: SCOPE-MAP-014, version: "1.0", status: validated }
pitch:
  id: PITCH-014
  betting_state: bet
  cycle: 2026-C4
  appetite: six weeks
  problem: Returning customers rebuild the same cart by hand every week.
  desired_outcome: A customer repeats a past order in one tap.
  no_gos: [no subscriptions or scheduled reorders, no changes to checkout]
scopes:
  - id: SCOPE-001
    name: Quick reorder
    outcome: Tapping Reorder on a past order fills the cart with its items at current prices.
    class: must_have            # jev_scope_choice
    must_haves:
      - reorder a past order into the cart
      - skip items no longer sold and say so
    rabbit_holes: [price changes since the original order — use current price]
    depends_on: []
    slice_id: orders-quick-reorder
  - id: SCOPE-002
    name: Reorder edit step
    outcome: Before adding, the customer can change quantities or drop items.
    class: nice_to_have         # jev_scope_choice
    must_haves: [edit quantities before adding to the cart]
    depends_on: [SCOPE-001]
    slice_id: orders-reorder-edit
validation: { all_items_placed: true, unplaced_items: [], cycles: [], fits_appetite: true }
```

## 3. Intents

`node .harness/scripts/init-slice.mjs orders-quick-reorder`, then `.harness/specs/orders-quick-reorder/intent.md`:

```markdown
# Intent: orders-quick-reorder

## Source
- Pitch ID: PITCH-014
- Scope ID: SCOPE-001 — Quick reorder
- Scope map: .harness/specs/orders-quick-reorder/scope-map.yaml
- Betting state: bet
- Cycle: 2026-C4
- Scope class: must_have

## Problem
Returning customers rebuild the same cart by hand every week.

## Desired Outcome
Tapping Reorder on a past order fills the cart with its items at current prices.

## Appetite
Six weeks for the whole pitch (shared with orders-reorder-edit).

## Must-have outcomes
- MH-01: When a signed-in customer taps Reorder on a past order, the system shall add every still-sold item of that order to the cart at its current price.
- MH-02: If an item of the past order is no longer sold, then the system shall leave it out of the cart and tell the customer which item was skipped.

## No-gos
- No subscriptions or scheduled reorders.
- No changes to checkout.

## Rabbit holes
- Price changes since the original order — always use the current price and show it in the cart.

## Actors
- Signed-in returning customer: repeats a past order.

## Depends on
- none

## Open questions
- none
```

Each must-have passed `jev_ears_gate`. `orders-reorder-edit` gets its own intent the same way, with `Scope class: nice_to_have` and `Depends on: orders-quick-reorder`.

## 4. Handoff

1. `@asdd-discovery-agent` on `orders-quick-reorder` first (no dependencies, must-have).
2. `@asdd-discovery-agent` on `orders-reorder-edit` after `orders-quick-reorder` passes QA.
3. If week five arrives and SCOPE-002 is not close to done, hammer it: the cycle ships SCOPE-001 alone. SCOPE-002 does not move to a backlog; if it still matters, it is shaped and pitched again.
