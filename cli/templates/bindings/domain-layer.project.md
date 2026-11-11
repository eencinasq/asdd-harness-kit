---
inclusion: auto
tags:
  - domain
---

# Domain layer — project binding (stub)

> Implements the portable contract in [domain-layer.md](domain-layer.md). Fill before Domain / Design / Implementation.

## Primary artifacts

| Role | Path / package |
|------|----------------|
| Domain model / entities | … |
| Use cases / domain services | … |
| Ports | … |
| Adapters | … |
| Delivery (HTTP/UI/CLI) | … |

## Layer flow

`Transport` → `Domain` → `Port` → `Adapter`

## Enforcement

**Gate command:** `…` (non-zero exit = not passing)

**Semgrep rules:** `…` (optional path to a YAML config such as `.semgrep.yml`; if unfilled, `.semgrep.yml` at the repo root is used when it exists)

**CI / lint:** …

## Semgrep boundaries

Used when `Semgrep rules` is unfilled and the repo has no `.semgrep.yml`. The architecture check generates a temporary config from these rows and the `Language` row in [tech.md](tech.md). It runs `semgrep scan --json` and does not write `.semgrep.yml`.

| Paths | Must not import |
|-------|-----------------|
| `…` | `…` |

## Exceptions

Document justified exceptions and cite ADRs. Existing code alone is not enough.
