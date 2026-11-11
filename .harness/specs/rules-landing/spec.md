# rules-landing — Spec (lite)

## Intent

Land the Phase-1 implementation checklist (`L-1`→`L-3`) of the converged rules
proposal `@asdd/proposals/rules/v1.md` (vault; `v1.review.md` verdict CONVERGED):
establish the `.agents/rules/` modular-policy root, wire installer copy +
collision guard + version stamping, and add the `AGENTS.md` rules-routing
section. Decision contract: `D-7`, `D-8`, `D-10` — Phase-2 guardrails `AR-1…AR-7`
stay deferred.

## Scope / file map

- `.agents/rules/_rule-profile.md` — new contract-doc: both profile grammars,
  element dispositions, demarcation law, contract-doc registry, templates (`D-10`)
- `scripts/install-into.sh` — `install_rules_core` (dir-exists precondition) +
  `guard_rule_collisions` (file-level, managed_files provenance) + `main()`
  invocation (`D-7`)
- `scripts/generate-versions.mjs` — `.agents/rules` walk (`D-7`)
- `.harness/config/versions.json` — regenerated stamps (`D-7`)
- `scripts/test-install-into.sh` — rules-guard parity tests (`D-7` EARS:
  halt, `--force` no bypass, `--dry-run` reports, legacy halt, unique-name survival)
- `AGENTS.md` — `## Modular rules` routing section (`D-8`, `L-3`; interim
  dispatch-path clause per `AR-7` interim)

## Explicitly out of scope (Phase-2 guardrails)

`check-rule-profile.mjs` (`AR-1`), `AGENTS.md` Profile-A retrofit (`AR-2`),
generated runtime projections (`AR-3`), budget analyzer (`AR-4`),
`rule-authoring` capability (`AR-5`), `guard_agent_collisions` parity (`AR-6`),
mount propagation (`AR-7`). `.harness/steering/*` untouched — sibling scope
(`Q-R1`). No `.agents/rules/<name>.md` real rules yet — routing entries land as
rules land (`IC-2`).

## Verification

- `bash -n scripts/install-into.sh` · `node --check scripts/generate-versions.mjs`
- `node scripts/generate-versions.mjs` → `.agents/rules/_rule-profile.md` stamped
- `scripts/test-install-into.sh` → `== rule collision guard ==` OK (+ all prior blocks)
- `node .harness/scripts/check-invariants.mjs` — `DRIFT-02` FAILs pre-exist on the
  clean tree (verified via stash-and-recheck at `1891ace`; baseline drift from the
  quality-gates commit, not introduced by this slice)
