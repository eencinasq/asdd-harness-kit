# Capability: Green harness check (harness-green)

## Category
MAINTENANCE

## Scope
- Pitch ID: ad-hoc (Tech Lead request, 2026-11-14)
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md).

## Actors
- Tech Lead: decides how the always-loaded budget is kept (shorter descriptions, no budget increase).
- Kit maintainer: runs `asdd check` and `npm test`.

## Entities
- Always-loaded steering budget (31962 bytes), skills index, vendored harness copies, installed kit copies, versions.

## Out of Scope
Behaviour changes in the harness libraries; the other slices' specs.
