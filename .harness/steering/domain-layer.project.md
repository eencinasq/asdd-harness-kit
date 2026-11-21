---
inclusion: auto
tags:
  - discovery
  - domain
  - design
  - task_planning
  - implementation
  - qa
  - refactor
classification: binding
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
| Adapters | runtime hooks, MCP servers (`tools/*`, configured in `.agents/mcp/`; they load vendored copies of the `*-lib.mjs` files), installer |
| Delivery (HTTP/UI/CLI) | the asdd CLI (`cli/`; projects run the asdd-harness-kit package, a devDependency or global, never a copy) |

## Layer flow

`CLI / hook / MCP` → `*-lib.mjs` → state files

## Enforcement

**Gate command:** `npm test` (non-zero exit = not passing)

**Semgrep rules:** `.semgrep/` (`architecture/` boundaries, state, telemetry, adapters, hook-input taint; `standards/js.yml`; each rule file has a test file beside it — `semgrep --test .semgrep`)

**CI / lint:** `.github/workflows/harness-invariants.yml`; `asdd kit skills-lint`, `asdd kit agents-lint`; Biome in `tools/*`

## Semgrep boundaries

| Paths | Must not import |
|-------|-----------------|
| `cli/src/harness` | `.agents` |

## Dependency layers

`cli/src/harness` depends on nothing outside itself: `asdd kit vendor` copies its files into `tools/*/src/harness`, where only siblings resolve.

| Layer | Paths | May depend on |
|-------|-------|---------------|
| Shared | `cli/src/paths.mjs`, `cli/src/ui.mjs`, `cli/src/semver.mjs`, `cli/src/pin.mjs` | — |
| Harness | `cli/src/harness/**` | — |
| Installer | `cli/src/install/**` | Shared |
| Kit tooling | `cli/src/kit/**` | Harness, Installer, Shared |
| CLI entry | `cli/bin/**`, `cli/src/main.mjs`, `cli/src/doctor.mjs`, `cli/src/uninstall.mjs` | Harness, Installer, Kit tooling, Shared |

## Exceptions

None.
