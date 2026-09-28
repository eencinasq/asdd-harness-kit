# Domain layer — project binding (stub)

> Implements the portable contract in [../domain-layer.md](../domain-layer.md). Fill before Domain / Design / Implementation.

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

**CI / lint:** …

## Exceptions

Document justified exceptions and cite ADRs. Existing code alone is not enough.
