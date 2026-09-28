# Optional ASDD modules (kit)

Opt-in agents and skills. **Not** installed into `.agents/agents` / `.agents/skills` until you copy them.

| Module | Path | Install |
|--------|------|---------|
| **bruno** | `bruno/asdd-integration-tester.md` | `cp` → `.agents/agents/` + add `api-test.md` steering if needed |
| **playwright-e2e** | `playwright-e2e/asdd-e2e-tester.md` | `cp` → `.agents/agents/` + enable `playwright` in MCP |
| **web-ui** | `web-ui/skills/*` | `cp -R` → `.agents/skills/` + fill `design-system.md` + optional Storybook MCP |
| **http-api** | `http-api/skills/api-and-interface-design` | `cp -R` → `.agents/skills/` |

Then re-link runtimes ([`runtimes/README.md`](../../runtimes/README.md)).

## Kit core (already under `.agents/`)

discovery, spec, validation, domain, design, task-planning, implementation, qa, refactor, knowledge, lite  
+ product/spec skills listed in `.harness/steering/skills.md`
