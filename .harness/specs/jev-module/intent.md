# Intent: jev-module

> Source: ad-hoc (cooldown). Requested by the kit maintainer after the kit review (2026-10-28). Not part of a Shape Up pitch.

## Source

- **Pitch ID:** ad-hoc
- **Scope ID:** — jev-module
- **Scope class:** `must_have`

---

## Problem

Jev (TypeSafe System One) is an external service with an API key, yet every project the kit installs carries it as core: `jev-client.mjs`, `jev-gates.mjs`, the `jev-gate` MCP server, `jev.md` loaded on every session, a required `capabilities.jev` block in `project.json`, and an import of Jev code in `check-invariants.mjs` (whose call always returns "skipped"). Only two skills use it, and only when a team shapes work with Shape Up. A team that does not use Jev still pays for it in context, configuration, and dependencies, which contradicts the kit's claim to be portable.

## Desired Outcome

A team installs the kit without Jev and gets a working harness, including the `shape-up` and `product-delivery` skills with human-decided gates. A team that wants Jev's automated gates adds `--modules=jev` and gets exactly today's behavior. Projects that already have Jev keep it after upgrading.

## Appetite

One cooldown cycle (about one week of maintainer time).

## Must-have outcomes

- **MH-01:** When the installer runs without `--modules=jev`, the project shall receive no Jev script, MCP server entry, steering file, or `capabilities.jev` block, and `check-project-config.mjs` and `check-invariants.mjs` shall pass.
- **MH-02:** When the installer runs with `--modules=jev`, the project shall receive the Jev client, gates, MCP server and its `mcp.json` entry, `jev.md`, and the `capabilities.jev` block, and shall record `modules.jev: true`.
- **MH-03:** While the `jev` module is enabled, the `shape-up` and `product-delivery` skills shall require their Jev gates and shall not treat `unavailable` as a pass; while it is not enabled, they shall run the same criteria as a checklist and record a human decision.
- **MH-04:** When the installer upgrades a project that already has Jev installed, it shall keep Jev enabled as a module without a flag.
- **MH-05:** The core harness scripts shall not import Jev code.
- **MH-06:** The artifacts of this slice (specs, features, sessions) shall never be installed or copied into a project, and shall not be published in the npm package.

## Nice-to-haves (~)

- Always-loaded steering shrinks by the size of `jev.md`.

## No-gos

- Do not change Jev's thresholds or the System One client behavior.
- Do not remove the `jev-command-gate.mjs` shim (it belongs to the command gate, kit-hygiene REQ-009).
- Do not remove `shape-up` or `product-delivery` from the core (Tech Lead decision, 2026-10-28).

## Rabbit holes

- Existing projects have Jev files recorded as kit-managed and a `jev-gate` entry in `mcp.json`. Patch: detect an existing Jev install and treat the module as enabled (MH-04).
- `check_command_safety` (no Jev) lives in the `jev-gate` MCP server. Patch: the core points to the `command-gate.mjs` CLI; the tool stays in the module server, deprecated.

## Actors

- Adopting engineer: installs or upgrades the kit, with or without Jev.
- Shaper / product lead: runs `shape-up` and `product-delivery`.
- Coding agent: follows the skills and the harness.

## Depends on

- kit-hygiene (DONE): command gate renamed; guidance sensors in place.

## Open questions

- none blocking (Tech Lead chose: skills stay in core, gates become human-decided without the module)
