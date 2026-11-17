# Agent guide (ASDD + Harness Engineering)

Runtime-agnostic map. **Read this first**, then load steering from **`.harness/steering/`** directly.

- Process: [README → Guides, then sensors](https://github.com/eencinasq/asdd-harness-kit#guides-then-sensors)
- Portability: [README → Adopter checklist](https://github.com/eencinasq/asdd-harness-kit#adopter-checklist)
- Modules: maintained in [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit); enable them with the kit installer.

## INIT (every session)

Boot is a **strict sequence** — the sole order source. **Kernel first:** the always-loaded steering contracts are the primary artifacts. Missing `generated` state: regenerate with `asdd sync`, never by hand; anything else missing fails closed — HALT and report.

1. **Kernel** — `.harness/steering/` `inclusion: always` files (`controls`, `manifest`, `README`, `security-rules`, `session-loop`, `skills`), filename order.
2. Generated `.harness/state/registry.json` — squad index. **Stop:** all slices `DONE`/`PARKED`/`ABANDONED`, no named slice → ask for intent or unpark.
3. Generated `.harness/state/slices/<slice-id>/manifest.json` — phase, mode, `paths`; then `paths.features` when set.
4. `.harness/steering/` `inclusion: auto` files, filename order — only `tags` intersecting the phase (as named in `asdd sync`), `mode` (`lite`), or active role (`review`, `ui`); skip the rest.
5. Pick work — `phase` `implementation` → dependency-ready features; same-slice parallelism needs unique owners and disjoint scopes.

Boot ends at step 4 — `.agents/rules/`, agent profiles, `SKILL.md` bodies, `asdd knowledge` load on demand; agent-file `Read`s still apply. **Lite-first:** `lite` is the `asdd slice init` default; `--full` only for upfront cross-cutting/architectural work — growth escalates on evidence ([`asdd-lite.md`](.harness/steering/asdd-lite.md)).

## System of record

| Path | Role |
|------|------|
| `.harness/steering/` | Line-base (portable + bindings) |
| `.harness/specs/` | ASDD artifacts |
| `.harness/state/registry.json` | **Generated global index** — all slices, phases, contributors |
| `.harness/state/slices/<id>/manifest.json` | **Generated** per-slice phase machine |
| `.harness/state/slices/<id>/sessions/*.json` | Append-only session logs (one writer per file) |
| `.harness/features/` | Session feature tracker |
| `.harness/PROGRESS.md` | **Generated** active slices table for humans (`asdd sync`) |
| `.harness/knowledge/` | **Generated** knowledge index (graph + chunks via `asdd knowledge sync`; `asdd knowledge` queries it) |

## Modular rules

`.agents/rules/` is the canonical modular-policy root (`modular_policy` profile — normative grammar: [`.agents/rules/_rule-profile.md`](.agents/rules/_rule-profile.md)). A modular rule is unconditional, declarative negative space inside its declared scope; it outranks agents, skills, and prompts. Steering under `.harness/steering/` is a tag-scoped rule subtype — one file, one grammar; a `.agents/rules/` file never carries `inclusion:`/`tags:`.

- Discovery is by reference: when a task falls inside a rule's declared scope, **Read** the rule file by path before acting — rules are never assumed to load ambiently.
- `_`-prefixed files (e.g. `_rule-profile.md`) are contract documents, not active rules.
- When dispatching a task inside a rule's scope, include the rule's path in the dispatch contract — a rule binds a mounted subagent only when a reference reaches it.
- Routing entries for specific rules are added here as rules land.

## Working rules

1. One `in_progress` by default. Same-slice concurrency must follow ownership, dependency, and scope rules in `.harness/steering/session-loop.md`.
2. Never `passing` without `verification` + `evidence`.
3. Write a session file at the end of every significant action, then run `sync-state` to regenerate the manifest ([manifest.md](.harness/steering/manifest.md)).
4. Codegraph first: the `codegraph` skill (`codegraph explore …`).
5. Agents and skills run `asdd <command>` (the asdd-harness-kit package: the project's devDependency via `npx asdd`, or a global `asdd`), not MCP servers.
6. On failure: leave `in_progress`/`blocked`; log per path in `structure.md`.
7. Before session end or `passing`, `asdd check` must exit 0. On Cursor, the Verify-on-Stop hook injects FAIL output back into the prompt ([session-loop.md](.harness/steering/session-loop.md)). It includes spec drift ([spec-drift.md](.harness/steering/spec-drift.md)).
8. Modify only the files mapped to the active specification `.harness/specs/<slice>/intent.md`. Do not perform unrequested refactors. Mapping and the lite `spec.md` exception: [session-loop.md](.harness/steering/session-loop.md).

## Non-negotiables

1. SoT under `.harness/` only (never `.kiro/steering|specs|state`).
2. Agents **Read** `.harness/steering/` by path.
3. Domain: [domain-layer.md](.harness/steering/domain-layer.md) + [domain-layer.project.md](.harness/steering/domain-layer.project.md).
4. Gates: [quality-gates.md](.harness/steering/quality-gates.md) + [quality-gates.project.md](.harness/steering/quality-gates.project.md).
5. Fill project bindings before Discovery — stubs are not product truth.

## Baseline steering reads

See [`.harness/steering/README.md`](.harness/steering/README.md). Guides and sensors: [`.harness/steering/controls.md`](.harness/steering/controls.md). On a conflict, that file's precedence wins.
