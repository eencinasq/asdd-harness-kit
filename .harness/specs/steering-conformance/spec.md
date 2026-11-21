# steering-conformance — Spec (lite)

## Intent

Land Wave 2 of the microkernel work plan: ratify the converged
`harness.steering/v1` proposal (`kit_steering_rule`), eliminate all live
`steering-tags.mjs` warnings, and complete the remaining `kit_steering_rule`
slot retrofits. Scope follows the plan's three tasks — not the proposal's
full Phase-2 landing checklist (L-2/L-3/L-5/L-6 stay deferred).

## Requirements

- **REQ-001.** `asdd check` shall report zero `steering-tags` warnings:
  `knowledge.md` and `quality-gates.md` shall no longer carry pseudo-always
  tag sets (tags ⊇ all 9 phases), and `quality-gates.project.md` shall carry
  `validation` in `tags` in both `.harness/steering/` and
  `cli/templates/bindings/`.
- **REQ-002.** Retagged files shall keep honest coverage — a tag is dropped
  only where the file's own invariants assign no duty (`knowledge.md`
  KNO-01..05 cover discovery/spec/validation/task_planning/implementation/
  qa/knowledge/refactor; `quality-gates.md` hub machinery is reached via its
  phase-split children elsewhere).
- **REQ-003.** Every non-`_`, non-index steering file shall carry the
  `kit_steering_rule` required slots; `skills.md` shall gain a Negative
  space section (the fleet's last absent slot).
- **REQ-004.** `@asdd-harness-kit/proposals/harness.steering/v1.md` shall be
  flipped to `status: converged` in the vault, recording the human
  ratification (A-6) that activates Wave-2 landing items.
- **REQ-005.** The always-loaded budget shall stay within the binding —
  slot additions to `always` files stay minimal; runtime projections and
  installed copies are regenerated (`generate-runtime-steering`, `kit self`).
