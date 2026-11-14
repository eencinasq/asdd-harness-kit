# egm-shaping — Requirements

## P0 — Intent fitness (codeable intents)

- **REQ-001 (MUST).** The `product-delivery` skill shall define an **intent fitness** gate applied to every kept scope before `asdd slice init`. A scope is fit only when all of the following hold: (a) exactly one observable outcome; (b) **lite-fit** — expected to complete as one `lite` or `hotfix` slice unless the map records an explicit `full` or `re-split` decision with `decided_by`; (c) must-haves are EARS-ready with `decided_by`; (d) the intent is **self-contained** (readable without the pitch chat). Unfit scopes shall not create slices; the skill shall require re-split, `reshape`, or return `RE-SHAPING_REQUIRED` / unfit handoff guidance for Discovery.
- **REQ-002 (MUST).** `cli/skills/product-delivery/contracts/scope-map.schema.yaml` shall accept optional per-scope `intent_fit` fields (at least: `one_outcome`, `lite_fit`, `ears_ready`, `self_contained`, `status` ∈ `fit` | `unfit` | `pending`, and optional `decided_by` / `notes`) without breaking existing valid maps. References and the end-to-end example shall show a fit record.

## P1 — Goldfish scope-split review

- **REQ-003 (MUST).** After the scope map is proposed and before intents are written, `product-delivery` shall run a **scope-split review** that is artifact-first and critique-first: write `docs/pitches/<pitch-id>/scope-split-review.md` (or equivalent under the pitch directory) with multi-lens findings (at least: appetite fit, one demoable outcome per scope, ASDD lite-fit, no-gos/deps, gaps). The reviewing pass shall be instructed as **fresh-context / Goldfish** (no reliance on the drafting chat; quote the map). Human shall accept or ignore each material finding (`decided_by`) before intents proceed.
- **REQ-004 (MUST).** Ship `cli/skills/product-delivery/references/scope-split-review.md` describing lenses, critique-first rules, single-agent fresh-context protocol, and optional parallel subagents when the runtime supports them. Subagents shall not be required.

## P2 — Concepts brief + readiness (shape-up)

- **REQ-005 (MUST).** Shape Up Flow 4 (Explore) and any path from a vague idea toward a formal pitch shall support writing `docs/pitches/<pitch-id>/concepts_brief.md` from a template, with a **readiness gate** (open questions resolved or explicitly deferred with `decided_by`) before elevating to a full pitch / `ready_for_bet`.
- **REQ-006 (MUST).** Shape Up pitch review (Flow 2 / Step 4) shall include a Goldfish-style pass option: strongest failure mode first, quotes from the pitch, no empty praise; gate answers still require human `decided_by` before betting.

## P3 — Critique-first language

- **REQ-007 (MUST).** `shape-up` and `product-delivery` skill text (SKILL.md and the review references they load) shall state **critique-first / no-glazing**: start with the weakest point; forbid filler praise; require cited evidence for pass/fail. This is documentation/protocol only (no CI sensor).

## P4 — Optional brownfield bootstrap

- **REQ-008 (MUST).** Ship an optional reference (under `shape-up` and/or `product-delivery`) for an **EGM-inspired brownfield context pack** (what to read, what artifact to write, when to stop and shape) that points teams to `asdd init-flow` for harness bootstrap and does **not** replace Discovery, intents, or `.harness/` as SoT. Document that bug-sized work skips the pitch track (`asdd slice init --hotfix`).

## Cross-cutting

- **REQ-009 (MUST).** Kit source of truth for these skills remains `cli/skills/{shape-up,product-delivery}/`; install/self mirrors stay in sync. Docs (`docs/PLAYBOOK.md` and/or `cli/README.md`) shall mention intent fitness + scope-split review in the Shape Up → Product Delivery path. No change to Stop/DRIFT/converge ownership.
