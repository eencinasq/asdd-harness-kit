---
inclusion: auto
tags:
  - domain
---

# Domain layer — project binding (asdd-harness-kit)

> **Project binding for the kit itself.** Never shipped: projects get the stub from `cli/templates/bindings/domain-layer.project.md`.

The kit is a set of scripts and documents, not a layered application. Its "domain" is the harness state model.

## Primary artifacts

| Role | Path / package |
|------|----------------|
| Domain model / entities | `docs/architecture/domain-model.md`; slice, session, feature, pattern, proposal |
| Use cases / domain services | `cli/src/harness/*-lib.mjs` (drift, audit, learning, knowledge) |
| Ports | file formats: `.harness/state/**`, `.harness/features/*.features.json`, `feature.schema.json` |
| Adapters | runtime hooks, MCP servers (`.agents/mcp/`), installer |
| Delivery (HTTP/UI/CLI) | the asdd CLI (`cli/`; projects run the asdd-harness-kit package, a devDependency or global, never a copy) |

## Layer flow

`CLI / hook / MCP` → `*-lib.mjs` → state files

## Enforcement

**Gate command:** `npm test` (non-zero exit = not passing)

**Semgrep rules:** `…`

**CI / lint:** `.github/workflows/harness-invariants.yml`

## Semgrep boundaries

| Paths | Must not import |
|-------|-----------------|
| `cli/src/harness` | `.agents` |

## Exceptions

None.
