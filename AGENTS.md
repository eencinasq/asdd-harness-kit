# Agent guide (ASDD + Harness Engineering)

Runtime-agnostic map. **Read this first**, then load steering from **`.harness/steering/`** directly.

- Process: [docs/asdd-and-harness-engineering.md](docs/asdd-and-harness-engineering.md)
- Portability: [docs/asdd-harness-portability.md](docs/asdd-harness-portability.md)
- Modules: maintained in [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit); enable them with the kit installer.

## INIT (every session)

1. Read [`.harness/PROGRESS.md`](.harness/PROGRESS.md).
2. **Check the lock** — `.harness/state/locks/<slice-id>.lock`. If free, create `{"agent":"<your-id>","started":"<ISO-8601>","slice":"<slice-id>"}`.
3. Read [`.harness/state/slices/<slice-id>/manifest.json`](.harness/state/slices/).
4. Read features when `paths.features` is set.
5. **JIT steering loading:**
   - Each steering file has YAML frontmatter with `inclusion` and `tags`.
   - Load all `inclusion: "always"` files (controls, session-loop, manifest, skills, security-rules, README).
   - Load `inclusion: "auto"` files **only when their tags match the current phase** (e.g., `quality-gates.md` for validation/qa/implementation, `domain-layer.md` for discovery/domain).
   - Skip auto files whose tags do not intersect the current phase — this saves context window.
   - Small work → [`asdd-lite.md`](.harness/steering/asdd-lite.md).
6. Pick work:
   - All slices `DONE`/`PARKED`/`ABANDONED` and no named slice → **stop**; ask for new intent or unpark.
   - `phase` is `implementation` → choose dependency-ready features. Same-slice parallel work is allowed only with explicit unique owners, disjoint file scopes, and coordinator-held slice lock; otherwise work serially.

## System of record

| Path | Role |
|------|------|
| `.harness/steering/` | Line-base (portable + bindings) |
| `.harness/specs/` | ASDD artifacts |
| `.harness/state/manifest.json` | Global slice index only |
| `.harness/state/slices/<id>/manifest.json` | Per-slice phase machine |
| `.harness/state/locks/` | Multi-agent mutex |
| `.harness/features/` | Session feature tracker |
| `.harness/PROGRESS.md` | Active slices index |
| `.harness/progress/<id>.md` | Session record |

## Working rules

1. One `in_progress` by default. Same-slice concurrency must follow ownership, dependency, scope, and coordinator-lock rules in `.harness/steering/session-loop.md`.
2. Never `passing` without `verification` + `evidence`.
3. Update per-slice manifest at end of each ASDD phase ([manifest.md](.harness/steering/manifest.md)).
4. Codegraph first ([codegraph.md](.harness/steering/codegraph.md)).
5. On failure: leave `in_progress`/`blocked`; log per path in `structure.md`.
6. Before session end or `passing`, `node .harness/scripts/check-invariants.mjs` must exit 0. On Cursor, the Verify-on-Stop hook injects FAIL output back into the prompt ([session-loop.md](.harness/steering/session-loop.md)).
7. Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors. Mapping and the lite `spec.md` exception: [session-loop.md](.harness/steering/session-loop.md).

## Non-negotiables

1. SoT under `.harness/` only (never `.kiro/steering|specs|state`).
2. Agents **Read** `.harness/steering/` by path.
3. Domain: [domain-layer.md](.harness/steering/domain-layer.md) + [domain-layer.project.md](.harness/steering/domain-layer.project.md).
4. Gates: [quality-gates.md](.harness/steering/quality-gates.md) + [quality-gates.project.md](.harness/steering/quality-gates.project.md).
5. Fill project bindings before Discovery — stubs are not product truth.

## Baseline steering reads

See [`.harness/steering/README.md`](.harness/steering/README.md). Guides and sensors: [`.harness/steering/controls.md`](.harness/steering/controls.md). On a conflict, that file's precedence wins.
