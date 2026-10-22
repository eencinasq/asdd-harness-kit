---
name: capability-discovery
description: Brownfield onboarding — discovers major capabilities from ANY existing codebase via language-agnostic signals (topology, API/behavior surfaces, persistence entities, tests, docs/trackers), consolidates them into a deduped capability list, and lands them as ASDD slices. Use when onboarding an existing repo that has code but no specs, or when the user asks "what capabilities does this project have?"
---

# Capability Discovery — brownfield → capability list

Discover what a codebase **already does** and turn it into ASDD capability
candidates. Language- and framework-agnostic: works on signals every codebase
exposes, not on any specific stack.

## Principle

**Capabilities live at the seams.** Code already groups itself by capability —
the job is reading the grouping signals and consolidating, not inventing a
taxonomy. Every candidate must carry `provenance: imported-from-code` until a
human reviews it — discovered ≠ specified.

## Signal hierarchy (check each; skip what doesn't apply)

Ordered most-structural to most-semantic:

| # | Signal | How to read it (any stack) |
|---|--------|---------------------------|
| 1 | **Package/module topology** | Workspace manifests: `package.json` workspaces / `pnpm-workspace.yaml`, `go.work`, `Cargo.toml` members, `pyproject`/`requirements` groups, `settings.gradle`, `apps/` `packages/` `modules/` `services/` `libs/` dirs. Each top-level package ≈ capability candidate. |
| 2 | **Behavior surfaces** | Route/endpoint registrars, controllers, message/event handlers, CLI command tables, cron/queue/job consumers, UI route trees. Each coherent surface ≈ a capability (or a sub-capability of one). |
| 3 | **Persistence entities** | Schema files: `schema.prisma`, `schema.graphql`, `migrations/`, `drizzle/`, ORM model dirs, SQL DDL. Entity clusters (tables that change together) bound capabilities. |
| 4 | **Tests** | `*.test.*`/`spec`/`e2e` trees and describe-blocks — test names already describe behaviors = features under capabilities. |
| 5 | **Docs & trackers** | README/ARCHITECTURE/docs dirs, `docs/architecture`, `docs/discovery`, external tracker backlogs (Linear/Jira/GitHub Issues) via the `external-trackers` skill. |
| 6 | **Codegraph** | `codegraph_context` / `codegraph_explore` for module graph, top entry points, cluster shapes. Structural questions → codegraph, not grep loops. |
| 7 | **Knowledge index** | `knowledge_search` — is a capability already specced/imported? Prevents re-discovery. (`knowledge_status` first; if absent, `node .harness/scripts/sync-knowledge.mjs`.) |

## Procedure

1. **Inventory.** Sweep signals 1–5; collect a raw list of candidate names +
   where they live (paths). Don't judge yet.
2. **Cluster.** Merge candidates that share persistence entities and surface
   ownership. A cluster with its own entities + its own behavior surface =
   a capability; a cluster sharing a persistence boundary is usually a
   sub-capability, not a slice.
3. **Name.** Use the project's own vocabulary — load
   `domain-language-extraction` if terms are unclear. Never invent names.
4. **Dedupe.** `knowledge_search` each candidate — a match means *extend the
   existing slice*, not create a new one.
5. **Land.** For each surviving capability, write a **draft** `capability.md`
   (or `intent.md` for lite-sized work) in `.harness/specs/<slug>/` containing:
   - `provenance: imported-from-code` frontmatter marker;
   - `evidence_paths:` — the module/route/schema dirs it was found in;
   - `confidence:` note — which signals produced it (topology only = low;
     surface + entities + tests = high).
6. **Stop and hand off.** The list is a proposal — humans approve slice names
   and boundaries before Discovery expands them into full intents.

## Output contract

- Capability list (name, evidence paths, provenance, confidence)
- `.harness/specs/<slug>/capability.md` draft per capability
- Explicit note in output: which were found where, and that review is required

## Anti-patterns

- Inventing capabilities the code doesn't evidence
- Slicing by file type ("controllers", "utils") — capabilities are behaviors,
  not directories
- Treating a shared lib as a capability — libraries are consumed by capabilities
- Fabricating state: no fake sessions/manifests — the artifacts are *found*,
  the truth is the code
