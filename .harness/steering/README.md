# Harness steering (kit)

**SoT** for line-base rules. Agents **Read** files here directly.

Portability: [docs/asdd-harness-portability.md](../../docs/asdd-harness-portability.md) · Modules: [`.agents/modules/README.md`](../../.agents/modules/README.md)

## Layers

| Layer | Role |
|-------|------|
| **A. Kit core** | Portable contracts below |
| **B. Modules** | Opt-in under `.agents/modules/` |
| **C. Bindings** | `product.md`, `structure.md`, `tech.md`, `*.project.md` — **fill before Discovery** |
| **D. Runtimes** | `runtimes/` recipes |

## Portable contracts

| File | Contents |
|------|----------|
| `domain-layer.md` | Domain placement contract |
| `quality-gates.md` | CCS / coverage / readiness |
| `manifest.md` | Manifest schema v2 |
| `session-loop.md` | Features + locks + evidence |
| `asdd-lite.md` | 4-phase lite path |
| `codegraph.md` / `codegraph-agents.md` | Codegraph |
| `skills.md` | Skills index |
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

Templates: [`templates/`](templates/).

## Baseline reads

`structure.md`, `product.md`, `codegraph.md`, `manifest.md`, `session-loop.md`.  
Domain/Design/Impl/QA/Refactor: also `domain-layer.md` + `domain-layer.project.md`, and both quality-gates files when judging gates.
