---
inclusion: always
---

# Harness steering (kit)

**SoT** for line-base rules. Agents **Read** files here directly.

Portability: [docs/asdd-harness-portability.md](../../docs/asdd-harness-portability.md) · Modules: maintained in [asdd-harness-kit](https://github.com/eencinasq/asdd-harness-kit)

## Layers

| Layer | Role |
|-------|------|
| **A. Kit core** | Portable contracts below |
| **B. Modules** | Opt-in from the kit installer |
| **C. Bindings** | `product.md`, `structure.md`, `tech.md`, `*.project.md` — **fill before Discovery** |
| **D. Runtimes** | Runtime links installed by the kit; recipes remain in the kit source |

## Portable contracts

| File | Contents |
|------|----------|
| `domain-layer.md` | Domain placement contract |
| `quality-gates.md` | Coverage / readiness (Lite skips CCS) |
| `jev.md` | Jev skill-scoped to shape-up / product-delivery |
| `manifest.md` | Manifest schema v3 (generated from sessions) |
| `session-loop.md` | Features + evidence (no v2 locks) |
| `controls.md` | Guides, sensors, precedence |
| `asdd-lite.md` | 4-phase lite path |
| `codegraph.md` / `codegraph-agents.md` | Codegraph |
| `knowledge.md` | Knowledge index (spec/session/feature graph + search) |
| `spec-drift.md` | Spec drift and audit: entry points and usage by role (engineers, Tech Lead) |
| `skills.md` | Skills index (name + description only) |
| `security-rules.md` | Security baseline |

## Project bindings (stubs — rewrite)

| File | Contents |
|------|----------|
| `product.md` | Product / actors |
| `structure.md` | Layout + domain/ADR paths |
| `tech.md` | Stack + test commands |
| `domain-layer.project.md` | Concrete layers + gate |
| `quality-gates.project.md` | Gate commands + findings |
| `design-system.md` | Optional (module web-ui) |

Optional: [`templates/slice-manifest.stub.json`](templates/slice-manifest.stub.json) for new slices.

## Baseline reads

`structure.md`, `product.md`, `codegraph.md`, `manifest.md`, `session-loop.md`, `controls.md`, `jev.md`.  
Domain/Design/Impl/QA/Refactor: also `domain-layer.md` + `domain-layer.project.md`, and both quality-gates files when judging gates.
