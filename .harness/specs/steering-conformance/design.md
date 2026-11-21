# steering-conformance — Design (lite)

## Changes

- `cli/steering/knowledge.md` — tags →
  `[discovery, spec, validation, task_planning, implementation, qa, knowledge, refactor]`
  (KNO-01..05 assign no domain/design/lite duties). Resolves pseudo-always.
- `cli/steering/quality-gates.md` — tags → `[validation, qa]`. The hub
  carries gate machinery (EARS/actions/`QG-DEC-*`); phase content lives in
  `.phases`/`.exec`/`.learn`, which link back — the hub is pulled on demand
  where a gate is applied, and ambiently where gate *evaluation* is the
  phase's job. Resolves pseudo-always.
- `.harness/steering/quality-gates.project.md` +
  `cli/templates/bindings/quality-gates.project.md` — tags += `validation`
  (its QG-BIND-backed gates are evaluated at validation; resolves
  starvation).
- `cli/steering/skills.md` — add `## Negative space` (hybrid-index still
  needs the slot; ~3 short bullets).
- `.harness/steering/` copies + `.cursor/rules/asdd-steering.mdc` —
  regenerated (`kit self`, `kit generate-runtime-steering` — the auto table
  is tag-derived).
- Vault: `@asdd-harness-kit/proposals/harness.steering/v1.md` status →
  converged (A-6 ratification recorded).

## Domain terms

None new.

## Why retag, not reclassify

D-4b offers reclassify-to-`always` or retag. `always` costs +9,567 B
(knowledge 3,890 + quality-gates 5,677) against a binding at
36,197/36,500 — impossible without abandoning the JIT budget; D-5's
guardrail exists to prevent exactly that regression. Retag is the honest
path: coverage follows each file's own invariants.
