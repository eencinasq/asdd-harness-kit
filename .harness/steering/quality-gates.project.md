# Quality gates — project binding (stub)

> Concrete commands and findings for [../quality-gates.md](../quality-gates.md).

## Full-suite test command (SP-002)

```bash
# e.g. npm test / cargo test / pytest / go test ./...
```

Failure log path: (see `structure.md`)

## Domain placement findings

Map severities to this project's layout. Example rows:

| Finding | Severity | Action |
|---|---|---|
| Boundary gate non-zero | HIGH | BLOCK |
| Business rule in delivery layer with no ADR | MEDIUM | WARN |

## Related project paths

| Concern | Path |
|---------|------|
| Domain model | … |
| ADR index | … |
| Boundary gate | … |
