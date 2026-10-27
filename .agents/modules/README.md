# Optional ASDD modules (kit)

Opt-in agents and skills. **Not** installed into `.agents/agents` / `.agents/skills` until you copy them.

| Module | Path | Install |
|--------|------|---------|
| **bruno** | `bruno/asdd-integration-tester.md` | `cp` → `.agents/agents/` + add `api-test.md` steering if needed |
| **playwright-e2e** | `playwright-e2e/asdd-e2e-tester.md` | `cp` → `.agents/agents/` + enable `playwright` in MCP |
| **web-ui** | `web-ui/skills/*` | `cp -R` → `.agents/skills/` + fill `design-system.md` + optional Storybook MCP |
| **http-api** | `http-api/skills/api-and-interface-design`, `http-api/adapters/openapi.mjs` | `cp -R` skills → `.agents/skills/`; adapters → `.agents/mcp/adapters/` |

Then re-link runtimes ([`runtimes/README.md`](../../runtimes/README.md)).

## Spec compliance adapters

A module can ship adapters for the `verify_spec_compliance` tool of the `spec-drift-auditor` MCP server. The server loads every `*.mjs` (except `*.test.mjs`) from `.agents/mcp/adapters/` and from `.agents/modules/<module>/adapters/` for modules set to `true` in `.harness/config/project.json` → `modules`.

Contract: the default export is `{ id, description, run({ root, sliceId, readBinding }) }`, and `run` returns (or resolves to) `{ status, findings, message? }`:

- `status` is `pass`, `fail`, `unconfigured`, or `error`. `unconfigured` is never a pass.
- `findings` use the drift finding shape: `{ id: 'AUD-<8 hex>', check, severity, slice_id, node, paths, message }`.
- Adapters read their own bindings with `readBinding(root, file, label)` and keep no state. They must not write to the repository.
- Keep adapters self-contained (no relative imports): the installer copies them to `.agents/mcp/adapters/`.

| Adapter | Module | Bindings (`quality-gates.project.md`) |
|---------|--------|----------------------------------------|
| `openapi` | http-api | `Contract command` (run, non-zero exit = drift), else `OpenAPI spec` (JSON; every endpoint a requirement cites must exist) |

## Kit core (already under `.agents/`)

discovery, spec, validation, domain, design, task-planning, implementation, qa, refactor, knowledge, lite  
+ product/spec skills listed in `.harness/steering/skills.md`
