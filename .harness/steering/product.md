---
inclusion: auto
tags:
  - discovery
classification: binding
---

# Product overview — asdd-harness-kit

> **Project binding for the kit itself.** Never shipped: projects get the stub from `cli/templates/bindings/product.md`.

## Product name

**asdd-harness-kit** is a portable process layer that an installer copies into a product repository. It gives AI coding agents a governed pipeline (Shape Up → Product Delivery → ASDD phases → Harness execution) with steering contracts, agent definitions, skills, feature trackers, invariant checks, spec-drift sensors, a knowledge index, a learning loop, and runtime adapters.

## Product principles

- The kit brings the process; the adopting project brings its stack.
- Machine-checkable over prose: a rule that matters gets a sensor in `asdd check`.
- Project-owned files are created once and never overwritten; kit-owned files refresh on upgrade.
- Anything used only to develop the kit (its slices, specs, features, sessions, proposals, bindings) is never installed into a project.
- Small context: every steering line an agent loads on each session must earn its place.

## Key features

- Installer: the `asdd` CLI (`npx asdd-harness-kit install`) with runtime adapters (Cursor, Claude Code, OpenCode, Kimi, Junie, Devin, Kiro) and opt-in modules (`bruno`, `playwright-e2e`, `web-ui`, `http-api`).
- Steering contracts and quality gates (`.harness/steering/`); modular rules (`.agents/rules/`).
- Agents and skills (`.agents/agents/`, `.agents/skills/`), including the `/asdd-*` session skills.
- Slice sizes: lite-first slices, `--hotfix`, `--full`, evidence-based escalation (E1–E5), and post-DONE `slice amend`.
- Harness commands (`cli/src/harness/`): state sync, invariants, Verify-on-Stop and the command gate, spec drift, converge, audit, knowledge, the learning loop (`asdd learn`), pipeline metrics and HTML status, waves, portfolio, tracker sync.
- MCP servers: `knowledge`, `spec-drift` (with MCP App dashboards), and the kit-only `jev-gate` (`tools/`, configured in `.agents/mcp/`).
- Roadmap and gaps: `docs/ASDD-ROADMAP.md`; how-to plays: `docs/PLAYBOOK.md`.

## Actors / personas

| Actor | Goals |
|-------|-------|
| Kit maintainer | Evolve the kit through its own pipeline; release versions |
| Adopting engineer | Install the kit, fill bindings, run slices with an agent |
| Tech Lead (adopter) | Review PRs, own gates and bindings, decide steering proposals |
| Coding agent | Follow steering, edit only mapped files, record evidence |

## Business rules (non-negotiable)

1. An install never overwrites a project-owned file unless the user passes a `--force*` flag.
2. Kit development artifacts never reach a project: not through the installer, and not through the npm package.
3. Every artifact the installer refreshes carries the single kit version (`package.json`) in `.harness/config/versions.json`.
4. `npm test` passes before any change is released.
5. The `asdd` CLI has no runtime dependencies; the harness never installs npm packages into a project.
6. The kit governs agents; it does not run them (no orchestrator, no hosted loops) — `docs/ASDD-ROADMAP.md` §6.
