# Optional ASDD modules (kit)

Opt-in agents and skills. Enable them with `asdd install <dir> --modules=<a,b>` (or `--modules=all`); the installer copies them and re-renders the runtime agent files.

| Module | Path | Install |
|--------|------|---------|
| **bruno** | `bruno/asdd-integration-tester.md`, `bruno/skills/bruno-api-testing` | agent → `.agents/agents/`, skill → `.agents/skills/`; add `api-test.md` steering if needed |
| **playwright-e2e** | `playwright-e2e/asdd-e2e-tester.md`, `playwright-e2e/skills/playwright-e2e-testing` | agent → `.agents/agents/`, skill → `.agents/skills/`; enable `playwright` in MCP |
| **web-ui** | `web-ui/skills/*` | skills → `.agents/skills/` + fill `design-system.md` + optional Storybook MCP |
| **http-api** | `http-api/skills/api-and-interface-design`, `http-api/adapters/openapi.mjs` | skills → `.agents/skills/`; adapters → `.agents/mcp/adapters/` |

Module agents and skills follow the same grammar as the core ones (`asdd kit agents-lint`, `asdd kit skills-lint`). A module may name core skills and agents and its own, never another module's: a project may enable one without the other. Each skill in a module adds a row to the always-loaded skills index.

## Spec compliance adapters

A module can ship adapters for the `verify_spec_compliance` tool of the `spec-drift` MCP server. The server loads every `*.mjs` (except `*.test.mjs`) from `.agents/mcp/adapters/` and, in the kit repo, from `cli/modules/<module>/adapters/` for modules set to `true` in `.harness/config/project.json` → `modules`.

Contract: the default export is `{ id, description, run({ root, sliceId, readBinding }) }`, and `run` returns (or resolves to) `{ status, findings, message? }`:

- `status` is `pass`, `fail`, `unconfigured`, or `error`. `unconfigured` is never a pass.
- `findings` use the drift finding shape: `{ id: 'AUD-<8 hex>', check, severity, slice_id, node, paths, message }`.
- Adapters read their own bindings with `readBinding(root, file, label)` and keep no state. They must not write to the repository.
- Keep adapters self-contained (no relative imports): the installer copies them to `.agents/mcp/adapters/`.

| Adapter | Module | Bindings (`quality-gates.project.md`) |
|---------|--------|----------------------------------------|
| `openapi` | http-api | `Contract command` (run, non-zero exit = drift), else `OpenAPI spec` (JSON; every endpoint a requirement cites must exist) |

## Kit core (already under `.agents/`)

discovery, spec, validation, domain, design, task-planning, implementation, qa, refactor, knowledge, lite, spike-researcher  
+ product/spec skills listed in `.harness/steering/skills.md`
