---
name: capability-discovery
description: >-
  Discovers the capabilities an existing codebase implements as draft capability files. Use when onboarding a repository
  that has code but no specs. Do NOT use for a business canvas — use business-model-canvas; or for judging code against
  requirements — use codebase-audit.
metadata:
  tier: leaf
---

# Capability Discovery — brownfield → capability list

Discovers what a codebase **already does** and turns it into ASDD capability candidates. Capabilities live at the
seams: code already groups itself by capability, so the job is reading the grouping signals and consolidating, not
inventing a taxonomy. Every candidate carries `provenance: imported-from-code` until a human reviews it — discovered is
not specified.

**Operational boundary:** reads the repository, the codegraph index, and the knowledge index; writes only draft
`.harness/specs/<slug>/capability.md` (or `intent.md`) files. It never edits code, sessions, or manifests.

## Preconditions

- `asdd knowledge status` exits 0; if the index is absent, run `asdd knowledge sync` first.
- `codegraph status` reports an index (the `codegraph` skill); if codegraph is not installed, say so and read signals
  1–5 with Read/Grep.

## Input / Output Contract

- **Inputs:** `repo_root` (`path`, the repository root, required); `focus` (`string`, a path prefix to limit the sweep,
  optional).
- **Outputs:** `capability_list` (`markdown table` in the final message: name, evidence paths, provenance, confidence);
  `capability_drafts` (`markdown`, one `.harness/specs/<slug>/capability.md` per capability, with frontmatter
  `provenance: imported-from-code`, `evidence_paths:`, `confidence:`).

## Signals

Ordered most-structural to most-semantic; skip what does not apply.

| # | Signal | How to read it (any stack) |
|---|--------|---------------------------|
| 1 | Package/module topology | Workspace manifests (`package.json` workspaces, `pnpm-workspace.yaml`, `go.work`, `Cargo.toml` members, `settings.gradle`) and `apps/` `packages/` `modules/` `services/` `libs/` dirs. Each top-level package ≈ a candidate. |
| 2 | Behavior surfaces | Route registrars, controllers, message/event handlers, CLI command tables, job consumers, UI route trees. Each coherent surface ≈ a capability or a sub-capability. |
| 3 | Persistence entities | `schema.prisma`, `schema.graphql`, `migrations/`, ORM model dirs, SQL DDL. Entity clusters that change together bound capabilities. |
| 4 | Tests | Test trees and describe-blocks: test names describe behaviors = features under capabilities. |
| 5 | Docs & trackers | README, `docs/architecture`, `docs/discovery`, past pitches and scope issues. |
| 6 | Codegraph | `codegraph explore`, `codegraph files`, `codegraph impact` for module graph and cluster shapes. |
| 7 | Knowledge index | `asdd knowledge search "<capability>"`: is it already specced or imported? |

## Execution Protocol

### Step 1: Inventory

- **Action:** sweep signals 1–6 and list candidate names with the paths they live in. Do not judge yet.
- **Target:** `repo_root` (or `focus`).
- **Assertion:** every candidate has at least one evidence path that exists (`test -e <path>`).

### Step 2: Cluster

- **Action:** merge candidates that share persistence entities and surface ownership. A cluster with its own entities
  and its own behavior surface is a capability; a cluster sharing a persistence boundary is a sub-capability. Never
  slice by file type ("controllers", "utils"); a shared library is consumed by capabilities, not one.
- **Target:** the candidate list.
- **Assertion:** each capability names its entities and surfaces; no path belongs to two capabilities.

### Step 3: Name

- **Action:** name each capability in the project's own vocabulary; never invent names.
- **Target:** the clusters.
- **Assertion:** each name appears in the code, docs, or tests it came from (cite where).

### Step 4: Dedupe

- **Action:** `asdd knowledge search "<name>"` for each capability. A match means *extend the existing slice*, not a new one.
- **Target:** the knowledge index.
- **Assertion:** each capability is labelled `new` or `extends <slice-id>`.

### Step 5: Land the drafts

- **Action:** for each `new` capability write `.harness/specs/<slug>/capability.md` (or `intent.md` for lite-sized work)
  with `provenance: imported-from-code`, `evidence_paths:`, and `confidence:` (topology only = low; surface + entities +
  tests = high), plus the capability list in the final message, stating that human review is required.
- **Target:** `.harness/specs/<slug>/`.
- **Assertion:** one draft per `new` capability; no session, manifest, or feature file was written.

## Verification Gate

1. For each draft, `grep -c '^provenance: imported-from-code' .harness/specs/<slug>/capability.md` prints 1.
2. For each draft, every path under `evidence_paths:` exists (`test -e`).
3. `asdd check` exits 0.
4. Negative check: `git status --porcelain` lists no new or modified path outside `.harness/specs/` that was not
   already listed before Step 1.

## Escalation Gate

HALT after Step 5: the list is a proposal, and humans approve slice names and boundaries before Discovery expands them.
HALT earlier when two signals disagree on a boundary you cannot settle from the code (an entity cluster split across two
surfaces). Escalate as Context → Options → Recommendation → Decision Needed; never fabricate sessions or manifests.

## Handoff & Convergence

- **handoff → `domain-language-extraction`:** when capability names need the project's terms pinned; passes the
  capability drafts as `source_text`.
- **handoff → `codebase-audit`:** after the capabilities are specced, to judge code against their requirements.
