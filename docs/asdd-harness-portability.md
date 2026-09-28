# ASDD + Harness portability (kit)

How this template maps to product repos.

## Layers

| Layer | Here |
|-------|------|
| **A. Kit core** | This repository |
| **B. Modules** | `.agents/modules/` — `scripts/enable-module.sh <name>` |
| **C. Bindings** | `.harness/steering/{product,structure,tech,*.project}.md` stubs |
| **D. Runtimes** | `runtimes/README.md` |

## Adopter checklist

1. Use this template (GitHub "Use this template" or clone).
2. Fill all required bindings.
3. Wire IDE per `runtimes/README.md`.
4. Enable modules you need.
5. `node .harness/scripts/check-invariants.mjs`
6. Create first slice via Discovery or ASDD-Lite.

## Do not copy from a product monorepo

Specs, PROGRESS history, filled product/structure/tech, or Nx-specific boundary scripts from another app.
