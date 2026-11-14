# Optional ASDD modules (kit)

Opt-in agents and skills. Enable them with `asdd install <dir> --modules=<a,b>` (or `--modules=all`); the installer copies them and re-renders the runtime agent files.

| Module | Path | Install |
|--------|------|---------|
| **bruno** | `bruno/asdd-integration-tester.md`, `bruno/skills/bruno-api-testing` | agent → `.agents/agents/`, skill → `.agents/skills/`; add `api-test.md` steering if needed |
| **playwright-e2e** | `playwright-e2e/asdd-e2e-tester.md`, `playwright-e2e/skills/playwright-e2e-testing` | agent → `.agents/agents/`, skill → `.agents/skills/`; enable `playwright` in MCP |
| **web-ui** | `web-ui/skills/*` | skills → `.agents/skills/` + fill `design-system.md` + optional Storybook MCP |
| **http-api** | `http-api/skills/api-and-interface-design`, `http-api/adapters/openapi.mjs` | skills → `.agents/skills/`; adapters → `.agents/mcp/adapters/` |

Module agents and skills follow the same grammar as the core ones (`asdd kit agents-lint`, `asdd kit skills-lint`). A module may name core skills and agents and its own, never another module's: a project may enable one without the other. Each skill in a module adds a row to the always-loaded skills index.

## Authoring a module: `module.json`

Every directory here carries a `module.json` manifest (the extension manifest — D-1); mounts derive from it at install — there is no switch to update. Validation is fail-closed before any copy.

```json
{
  "schema_version": "1.0",
  "name": "http-api",                    // must equal the directory name
  "version": "1.0.0",
  "trust": "declarative",                // or "executable" when contributing adapters/mcp/hooks
  "engines": { "asdd": ">=3.12.0" },     // semver range; install fails closed on mismatch
  "contributes": {
    "skills":   [{ "path": "skills/x",    "mount": ".agents/skills/x" }],
    "agents":   [{ "path": "y.md",        "mount": ".agents/agents/y.md" }],
    "adapters": [{ "path": "adapters/z.mjs", "mount": ".agents/mcp/adapters/z.mjs", "contract": "spec-drift-adapter" }]
  }
}
```

- Contribution types: `agents`, `skills`, `rules`, `steering`, `bindings`, `adapters`, `mcp`, `hooks` — each must map to a registered class in `cli/registry/contribution-points.json` (unregistered → fail closed). `commands`/`phases` are kit-internal (Q-NEW-3).
- A `path` may be a file (mounted verbatim) or a directory (walked; `*.test.*`/`*.spec.*` skipped). Mounts must be relative project paths inside the module's claim — **cross-module mount collisions fail** (G-15).
- `adapters`/`mcp`/`hooks` are executable contributions: they require `trust: "executable"` plus a `contract` naming a known contract (`spec-drift-adapter`, `harness-telemetry`), and the adapter file must literal-export `{ id, description, run }` and make no filesystem-write calls (G-13).

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
