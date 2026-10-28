---
inclusion: auto
tags:
  - discovery
  - design
---

# Project structure — asdd-harness-kit

> **Project binding for the kit itself.** Never shipped: projects get the stub from `scripts/templates/bindings/structure.md`.

## Root layout

```
.
├── .agents/
│   ├── agents/          # ASDD agent definitions (shipped)
│   ├── skills/          # skills catalog (shipped)
│   ├── mcp/             # MCP servers + mcp.json (shipped)
│   └── modules/         # opt-in modules: bruno, playwright-e2e, web-ui, http-api (shipped when enabled)
├── .harness/
│   ├── steering/        # portable steering (shipped) + this kit's bindings (kit-only)
│   ├── scripts/         # harness scripts and validators (shipped; *.test.mjs are kit-only)
│   ├── config/          # versions.json, schemas (shipped); project.json (kit-only)
│   ├── specs/ features/ state/ audits/ knowledge/ PROGRESS.md   # this kit's own slices (kit-only)
├── runtimes/            # per-runtime recipes (kit-only; the installer wires them)
├── scripts/             # installer, version tool, kit tests, templates (installer and templates ship their output)
│   └── templates/       # PROGRESS.md, manifest.json, bindings/ stubs copied into projects
├── tools/drift-dashboard/   # source of .agents/mcp/ui/drift-dashboard.html (kit-only)
├── docs/                # seeded logs and knowledge-base README (seeded); architecture notes
├── AGENTS.md            # agent map (seeded into projects)
└── README.md            # kit documentation (kit-only)
```

**Shipped vs kit-only:** the installer copies explicit files and trees only (see `scripts/install-into.sh`). `scripts/test-install-into.sh` fails if a kit-only artifact appears in an installed project.

## Docs & domain SoT (required)

| Artifact | Path |
|----------|------|
| Domain model | `docs/architecture/domain-model.md` |
| ADR index | none yet (decisions live in slice designs and the README) |
| Agent failure log | `docs/agent-failure-log.md` |
| Dissent log | `docs/dissent-log.md` |
| Steering proposals | `docs/knowledge-base/steering-proposals/` (kit-only) |

## Ownership / conventions

- A new harness script goes in `.harness/scripts/`, its test next to it as `<name>.test.mjs`, and it is listed in `scripts/install-into.sh`, `scripts/generate-versions.mjs`, and the `npm test` script.
- A new validator goes in `.harness/scripts/validators/` and is wired in `check-invariants.mjs`.
- Steering rules that are numeric go only in `.harness/steering/quality-gates.md`.
