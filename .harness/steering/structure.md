---
inclusion: auto
tags:
  - discovery
  - design
---

# Project structure — asdd-harness-kit

> **Project binding for the kit itself.** Never shipped: projects get the stub from `cli/templates/bindings/structure.md`.

## Root layout

```
.
├── .agents/             # COPIES of cli/agents, cli/skills, cli/mcp (asdd kit self); edit the sources in cli/
├── .harness/            # the harness as installed in the kit (never shipped; edit sources in cli/). No .harness/cli: the kit runs node cli/bin/asdd.mjs
│   ├── steering/        # COPIES of cli/steering + this kit's own bindings (product, structure, tech, *.project, design-system)
│   ├── config/          # COPIES of cli/scaffold/config + cli/versions.json; project.json (the kit's own)
│   ├── specs/ features/ state/ audits/ knowledge/ PROGRESS.md   # this kit's own slices
├── cli/                 # the asdd CLI (npx asdd-harness-kit)
│   ├── src/harness/     # harness commands + libs: check, verify, gate, sync, knowledge, drift, audit, learn (compiled to cli/dist for the npm package; *.test.mjs kit-only)
│   ├── src/install/ kit/            # install, uninstall, kit versions|build|vendor|guidance (kit package only)
│   ├── AGENTS.md        # the agent map (installed at the project root; the kit root AGENTS.md is a copy)
│   ├── agents/ skills/ mcp/   # ASDD agents, skills catalog, MCP config + launchers (installed into .agents/)
│   ├── steering/        # portable steering + templates/ (installed into .harness/steering)
│   ├── scaffold/        # .harness skeleton: config schema + README, models.json, feature schema, folder READMEs
│   ├── versions.json    # every shipped artifact at the package version (asdd kit versions)
│   ├── templates/       # PROGRESS.md, manifest.json, bindings/ and docs/ stubs copied into projects
│   ├── modules/         # opt-in modules: bruno, playwright-e2e, web-ui, http-api (copied when enabled)
│   ├── runtimes/        # per-runtime recipes (the installer wires them; cursor/asdd-steering.mdc is copied)
│   └── test/            # kit tests: install.sh, lifecycle.sh, full-flow.sh, *.test.mjs (kit-only)
├── tools/spec-drift/    # spec-drift MCP server: audit tools + dashboard, analysis, PR review (source shipped; build in place)
├── tools/jev-gate/      # jev-gate MCP server, NestJS: System One gates for chat only (not part of the harness; kit-only)
├── tools/knowledge/     # knowledge MCP server, NestJS: index search/trace/slice + learning patterns (source shipped; build in place)
│                        # tools/*/src/harness/ = GENERATED copies of cli/src/harness libs (asdd kit vendor); servers never load the project's harness
├── docs/                # seeded logs and knowledge-base README (seeded); architecture notes
├── AGENTS.md            # COPY of cli/AGENTS.md (asdd kit self)
└── README.md            # kit documentation (kit-only)
```

**Shipped vs kit-only:** everything a project receives lives in `cli/` (and `.agents/`, `tools/`, `AGENTS.md`); the installer copies explicit files and trees only (see `cli/src/install/`). Edit steering in `cli/steering/`, never in `.harness/steering/` (copies), then run `npm run self` (`asdd kit self`); `npm test` fails while a copy is stale. `cli/test/install.sh` fails if a kit-only artifact appears in an installed project.

## Docs & domain SoT (required)

| Artifact | Path |
|----------|------|
| Domain model | `docs/architecture/domain-model.md` |
| ADR index | none yet (decisions live in slice designs and the README) |
| Agent failure log | `docs/agent-failure-log.md` |
| Dissent log | `docs/dissent-log.md` |
| Steering proposals | `docs/knowledge-base/steering-proposals/` (kit-only) |

## Ownership / conventions

- A new harness command goes in `cli/src/harness/` (its test next to it as `<name>.test.mjs`, listed in the `npm test` script) and gets an `asdd` name in `cli/src/harness/commands.mjs`. The installer and `asdd kit versions` pick up every file there.
- A new validator goes in `cli/src/harness/validators/` and is wired in `asdd check`.
- Steering rules that are numeric go only in `.harness/steering/quality-gates.md`.
