---
inclusion: auto
tags:
  - validation
  - qa
---

# Quality gates — project binding

Concrete commands, paths, and findings for [quality-gates.md](quality-gates.md). Fill every `…` slot before Discovery. A stub value does not satisfy a gate.

## Acceptance criteria

- **QG-BIND-01.** The agent shall use the full-suite test command, the failure log path, the active findings, and the related paths recorded in this file.
- **QG-BIND-02.** The agent shall not replace a filled value in this file with a command, path, or finding taken from another file.
- **QG-BIND-03.** If a slot required by the gate under evaluation is still `…`, empty, or only a commented example, then the agent shall return BLOCK and shall not invent a substitute.
- **QG-BIND-04.** If `Active findings` is `unfilled` or absent, then the agent shall not enforce the inactive example rows and shall return BLOCK for the Domain Placement Gate.
- **QG-BIND-05.** When this file states `Active findings: none`, the agent shall apply only [domain-layer.md](domain-layer.md) and [domain-layer.project.md](domain-layer.project.md) for placement.
- **QG-BIND-06.** When a changed file matches a row under `Active findings`, the agent shall return that row's Action for the Domain Placement Gate.
- **QG-BIND-07.** When the full-suite test command exits non-zero or reports one or more failures, the Tech Debt Cleanup Gate shall return BLOCK.
- **QG-BIND-08.** When the full-suite test command exits zero and reports zero failures, the agent shall record zero failures for the Tech Debt Cleanup Gate.

## Full-suite test command (SP-002)

```bash
# Replace this comment with the project command, for example npm test.
```

Failure log path: `…`

## Domain placement findings

```
Active findings: unfilled
```

Before Discovery, replace `unfilled` with `none`, or with a table of one row per finding. The example rows below stay inactive while the status is `unfilled`.

| Finding | Severity | Action |
|---|---|---|
| Boundary gate non-zero | HIGH | BLOCK |
| Business rule in delivery layer with no ADR | MEDIUM | WARN |

## Related project paths

| Concern | Path |
|---------|------|
| Domain model | `…` |
| ADR index | `…` |
| Boundary gate | `…` |
