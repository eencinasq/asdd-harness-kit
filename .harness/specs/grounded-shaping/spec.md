# grounded-shaping — Spec (lite)

## Intent

P6.3 (gap G25). Pitches and intents must be grounded in what already exists — code, specs, and past slices — so
scopes reuse components and appetites are not overestimated. Today `shape-up` has only an optional, manual brownfield
pack and `product-delivery` checks fitness without comparing against anything existing. Add a mandatory grounding
step to both skills (knowledge search for capabilities, REQs and slices; codegraph for components; DONE slices of
similar shape for appetite), a Reuse / Extend / New table carried into the pitch and every intent, and a PO mode whose
output is the configured tracker (pitch container + one Intent item per scope) instead of repository files. A scope
that duplicates an existing capability is merged or cut. Guide change: QG-LEARN-10 requires `skill-eval` evidence.

Mapped: `cli/skills/shape-up/SKILL.md`, `cli/skills/shape-up/references/**`, `cli/skills/product-delivery/SKILL.md`, `cli/skills/product-delivery/references/**`, `cli/eval/skills/shape-up/**`, `cli/eval/skills/product-delivery/**`, `.agents/skills/shape-up/**` and `.agents/skills/product-delivery/**` (copies, `asdd kit self`), `cli/versions.json` (regenerated), `.harness/config/versions.json` and `.harness/config/installed-versions.json` (kit records refreshed by `asdd kit self`)

## Requirements

- **REQ-001.** `shape-up` shall run a grounding step before writing a pitch and record a Reuse / Extend / New table in which every row cites evidence (a `REQ-…`, a slice id, or a repo path).
- **REQ-002.** The pitch appetite shall cite at least one reference slice (DONE, similar scope) with its feature count, or state that none exists.
- **REQ-003.** `product-delivery` shall give each scope a Reuse / Extend / New breakdown and shall merge or cut a scope that duplicates an existing capability.
- **REQ-004.** In PO mode both skills shall write only to the tracker configured in `project.json` (pitch container and Intent items in the canonical format) and shall not write repository files.
- **REQ-005.** `asdd skill-eval` fixtures shall cover the grounding step and the PO-mode output contract for both skills.

## Depends on

`tracker-binding` (Intent format, tracker config).
