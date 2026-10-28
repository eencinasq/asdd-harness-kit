---
inclusion: auto
tags:
  - discovery
  - design
---

# Project structure (stub)

> **Project binding** — replace with this repo's layout. Agents use this file to find code and docs; wrong paths mis-steer every phase.

## Root layout

```
.
├── …                    # apps / packages / services
├── docs/                # architecture, ADRs, knowledge
├── .harness/            # ASDD SoT
├── .agents/             # canonical agents, skills, MCP
└── AGENTS.md
```

## Docs & domain SoT (required)

| Artifact | Path |
|----------|------|
| Domain model | `docs/…` |
| ADR index | `docs/…` |
| Agent failure log | `docs/agent-failure-log.md` |
| Dissent log | `docs/dissent-log.md` |

## Ownership / conventions

<!-- Where new code goes; boundaries between apps and shared libs. -->
