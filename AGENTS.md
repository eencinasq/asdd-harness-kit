# Agent guide (ASDD + Harness Engineering)

Runtime-agnostic map. **Read this first**, then load steering from **`.harness/steering/`** directly.

- Process: [README → Guides, then sensors](https://github.com/eencinasq/asdd-harness-kit#guides-then-sensors)
- Portability: [README → Adopter checklist](https://github.com/eencinasq/asdd-harness-kit#adopter-checklist)
- Modules: maintained in [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit); enable them with the kit installer.
- Jev (shape-up / product-delivery only): [README → Jev (skill-scoped)](https://github.com/eencinasq/asdd-harness-kit#jev-skill-scoped) · [`.harness/steering/jev.md`](.harness/steering/jev.md)

## INIT (every session)

1. Read generated `.harness/state/registry.json` for squad state.
2. Read generated `.harness/state/slices/<slice-id>/manifest.json` for the target slice.
3. Read features when `paths.features` is set.
4. **JIT steering loading:**
   - Each steering file has YAML frontmatter with `inclusion` and `tags`.
   - Load all `inclusion: "always"` files (controls, session-loop, manifest, skills, security-rules, jev, README).
   - Load `inclusion: "auto"` files **only when their tags match the current phase** (as named in `sync-state.mjs`, e.g. `task_planning`), the slice `mode` (`lite`), or the active role (`review`, `ui`).
   - Skip auto files whose tags do not intersect those keys — this saves context window. Explicit `Read` instructions in an agent file always apply.
   - **Lite-first:** all slices start in `lite` mode (default in `init-slice.mjs`). Use `--full` only for work known upfront to be cross-cutting/architectural. Growth in a lite slice triggers evidence-based escalation — see [`asdd-lite.md`](.harness/steering/asdd-lite.md).
5. Pick work:
   - All slices `DONE`/`PARKED`/`ABANDONED` and no named slice → **stop**; ask for new intent or unpark.
   - `phase` is `implementation` → choose dependency-ready features. Same-slice parallel work is allowed only with explicit unique owners and disjoint file scopes; otherwise work serially.

## System of record

| Path | Role |
|------|------|
| `.harness/steering/` | Line-base (portable + bindings) |
| `.harness/specs/` | ASDD artifacts |
| `.harness/state/registry.json` | **Generated global index** — all slices, phases, contributors |
| `.harness/state/slices/<id>/manifest.json` | **Generated** per-slice phase machine |
| `.harness/state/slices/<id>/sessions/*.json` | Append-only session logs (one writer per file) |
| `.harness/features/` | Session feature tracker |
| `.harness/PROGRESS.md` | Active slices index (human-curated or generated) |
| `.harness/knowledge/` | **Generated** knowledge index (graph + chunks via `sync-knowledge.mjs`; `knowledge` MCP server queries it) |

## Working rules

1. One `in_progress` by default. Same-slice concurrency must follow ownership, dependency, and scope rules in `.harness/steering/session-loop.md`.
2. Never `passing` without `verification` + `evidence`.
3. Write a session file at the end of every significant action, then run `sync-state` to regenerate the manifest ([manifest.md](.harness/steering/manifest.md)).
4. Codegraph first ([codegraph.md](.harness/steering/codegraph.md)).
5. On failure: leave `in_progress`/`blocked`; log per path in `structure.md`.
6. Before session end or `passing`, `node .harness/scripts/check-invariants.mjs` must exit 0. On Cursor, the Verify-on-Stop hook injects FAIL output back into the prompt ([session-loop.md](.harness/steering/session-loop.md)). It includes spec drift; engineers and the Tech Lead also use the `spec-drift-auditor` MCP server ([spec-drift.md](.harness/steering/spec-drift.md)).
7. Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors. Mapping and the lite `spec.md` exception: [session-loop.md](.harness/steering/session-loop.md).

## Non-negotiables

1. SoT under `.harness/` only (never `.kiro/steering|specs|state`).
2. Agents **Read** `.harness/steering/` by path.
3. Domain: [domain-layer.md](.harness/steering/domain-layer.md) + [domain-layer.project.md](.harness/steering/domain-layer.project.md).
4. Gates: [quality-gates.md](.harness/steering/quality-gates.md) + [quality-gates.project.md](.harness/steering/quality-gates.project.md).
5. Fill project bindings before Discovery — stubs are not product truth.
6. Jev is required **only** inside `shape-up` and `product-delivery` (prefer `jev-gate` MCP). Set `JEV_API_KEY` for those skills; do not treat `unavailable` as a pass. Harness ASDD must not call Jev.

## Baseline steering reads

See [`.harness/steering/README.md`](.harness/steering/README.md). Guides and sensors: [`.harness/steering/controls.md`](.harness/steering/controls.md). On a conflict, that file's precedence wins.
