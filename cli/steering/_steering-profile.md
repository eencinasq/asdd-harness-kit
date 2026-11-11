# Steering Profile — `kit_steering_rule` (normative contract)

> **Contract document.** This file is a `contract-doc` — it carries no frontmatter, is
> never JIT-loaded, and is exempt from the rule-slot grammar it defines (see
> *Contract-doc registry* below). Ratified by steering proposal
> `@asdd/proposals/harness.stearing/v1` — steering changes flow through steering
> proposals (`controls.md` precedence #5).

## What a steering file is

A `.harness/steering/*.md` file is a **JIT-loaded modular rule**: declarative policy
loaded only when the slice phase, mode, or active role matches its tags. Rules govern
state and boundaries — procedures live in skills (`rule.spec` §5.2).

```text
steering_file := FRONTMATTER TITLE SCOPE INVARIANTS+ [NEGATIVE_SPACE] [ENFORCEMENT] [ESCALATION]
```

## Frontmatter contract (mandatory)

```yaml
---
inclusion: always | auto          # required — JIT loading class
tags:                             # required iff auto (⊆ tag vocabulary); omitted/empty iff always
  - <tag>
classification: portable | binding | module | index | hybrid-index   # required — file class
---
```

- **File classes** (valid frontmatter values): `portable`, `binding`, `module`,
  `index`, `hybrid-index`. Every frontmatter-carrying file has exactly one.
- **Registry classes** (live only in `steering.registry.json`, never in frontmatter):
  `artifact_template` (files under `templates/`) and `contract-doc` (`_`-prefixed
  files) — these artifacts carry no rule frontmatter by definition.
- Frontmatter values SHALL match the file's entry in `.harness/config/steering.registry.json`.

## Tag vocabulary (frozen — 13 values)

Match keys = slice **phases** + optional **`refactor`** phase + slice **mode** + active
**roles**:

```text
discovery, spec, validation, domain, design, task_planning, implementation, qa,
knowledge   ← PHASES (source of truth: cli/src/harness/sync-state.mjs export PHASES)
refactor    ← optional phase
lite        ← slice mode
review, ui  ← active roles
```

The validator (`steering-tags.mjs` `STEERING_TAGS`) enforces this set. A new tag value
requires a steering proposal + validator update + recorded decision — never a silent
addition.

## File classes & slot requirements

| Class | Files | TITLE+SCOPE | INVARIANTS | NEGATIVE_SPACE | ENFORCEMENT | ESCALATION |
|-------|-------|-------------|------------|----------------|-------------|------------|
| `portable` | cross-cutting contracts | required | required, numbered, falsifiable | **required** | named check or `reviewer-enforced` | required for gate/rule files |
| `binding` | `*.project.md`, `product`/`structure`/`tech`/`design-system` | required + `> **Project binding**` marker | optional | optional | optional | optional |
| `module` | module-gated contracts | required + module note in SCOPE | required | required | required | required |
| `index` | `README.md` | required | N/A — carries layer/file tables | N/A | N/A | N/A |
| `hybrid-index` | `skills.md` | required | disclosure rules | optional | named regen check | optional |
| `contract-doc` | `_*.md` (registry class) | no frontmatter, not JIT-loaded, exempt from rule slots |
| `artifact_template` | `templates/*` (registry class) | outside this profile entirely |

## Tag-coverage rule (two finding classes)

1. **Starvation:** a file's `tags` SHALL cover every match key where its normative
   content applies (recorded in the registry `coverage` field). Contract↔binding pairs
   (`x.md` / `x.project.md`) SHALL have symmetric coverage or a documented rationale.
2. **Pseudo-always:** an `auto` file whose `tags` cover all 9 `PHASES` is a disguised
   `always` file — resolve by reclassifying `always` (requires a recorded budget
   decision, see below) or retagging to real coverage.

## Budget rules

- **Per-file cap:** 24,000 bytes (`rule.spec` `R-004`, verbatim).
- **Always-loaded budget:** `AGENTS.md` + `inclusion: always` steering ≤ the recorded
  binding in `quality-gates.project.md` (currently `34000`; measured by
  `asdd kit guidance`). Raised only by recorded decision — see proposal `v1` `D-5`.
- **Ordering guardrail:** the effectively-always sensor tier (files whose tags cover
  all 9 `PHASES`) lands before any `auto`→`always` reclassification.

## Demarcation law (steering vs modular rules)

- Holds **unconditionally** for every actor in its path scope → `.agents/rules/` or
  `AGENTS.md` (`modular_policy` / `directory_root` — see sibling proposal `rules/v1`).
- Holds only when a **phase/mode/role** matches → `.harness/steering/` (this profile).
- `inclusion:`/`tags:` keys are **reserved to steering** — a `.agents/rules/` file
  carrying them is a profile violation; one file, one grammar.

## Contract-doc registry

`_`-prefixed files are contract documents (like `.agents/agents/_runtime-template.md`),
exempt from frontmatter and rule slots **only when declared**:

| File | Class | Declared |
|------|-------|----------|
| `_steering-profile.md` | `contract-doc` | here + `steering.registry.json` |

An undeclared `_`-file carrying `## Invariants` / `## Negative Space` /
`## Non-Negotiable` headings is a profile violation, not an exemption.

## Enforcement & transitional states

`asdd check` → `validators/steering-tags.mjs` enforces:

| Check | State |
|-------|-------|
| missing/invalid `inclusion` on a non-`_` file | **fail** |
| `auto` with zero tags; tag outside vocabulary | **fail** |
| `classification` invalid or ≠ registry entry | **fail** |
| `.md` absent from the registry (kit + `steering.registry.local.json`) | **fail** |
| undeclared `_`-file with rule-shaped headings | **fail** |
| `classification` absent (registered file) | warn — transitional until fleet retrofit |
| coverage key missing from `tags` (starvation) | warn — recorded Phase-2 backlog |
| pseudo-always tag set | warn — resolve per coverage rule |
| `x`/`x.project` tag asymmetry | warn |
| `AGENTS.md` always-list ≠ registry | warn — doc drift |
| `README.md` table / `asdd-steering.mdc` lists ≠ registry | **fail** — kit-managed projections |
| `asdd-steering.mdc` marked sections ≠ `generate-runtime-steering.mjs` output | **fail** — `D-12` generated projection (`G-6` resolved: phase rows are tag-derived; no row may mandate `auto` reads) |

## Authoring & change path

- New steering files: pick the class by the demarcation law, copy the slot grammar
  above, register in `steering.registry.json` (`kit` block) — consumer projects use
  `.harness/config/steering.registry.local.json` (`project` block, same grammar).
- The installer copies files by install surface: portable contract files + this profile
  ship to consumers; `*.project.md`/`product`/`structure`/`tech`/`design-system` kit
  files describe the kit itself and are never shipped (stubs ship instead);
  `module`-class files ship only when their module is enabled.
- All changes to steering content flow through a steering proposal
  (`templates/steering-proposal.md`).
- `templates/` scaffolds are `artifact_template` — outside this grammar; their
  contract lives in [_template-profile.md](_template-profile.md) (`D-9`).
