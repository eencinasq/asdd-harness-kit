# asdd-harness-kit

**GitHub / Cursor template** for Agent Specification-Driven Development (ASDD) + Harness Engineering.

Stack-agnostic process layer: agents, skills, steering contracts, session locks, and feature trackers. You fill **project bindings** for your product (Python, Go, Rails, Next.js, Nest, …).

## Quick start

```bash
# From GitHub "Use this template", or:
git clone <this-repo> my-project && cd my-project

# 1. Fill bindings (required)
$EDITOR .harness/steering/product.md
$EDITOR .harness/steering/structure.md
$EDITOR .harness/steering/tech.md
$EDITOR .harness/steering/domain-layer.project.md
$EDITOR .harness/steering/quality-gates.project.md

# 2. Wire your IDE runtime (Cursor example)
mkdir -p .cursor/agents .cursor/skills
ln -sfn ../../.agents/agents .cursor/agents-src   # or per-file symlinks — see runtimes/README.md
ln -sfn ../../.agents/skills .cursor/skills
ln -sfn ../.agents/mcp/mcp.json .cursor/mcp.json
cp runtimes/cursor/asdd-steering.mdc .cursor/rules/asdd-steering.mdc

# 3. Optional modules
# cp .agents/modules/bruno/asdd-integration-tester.md .agents/agents/
# cp -R .agents/modules/http-api/skills/api-and-interface-design .agents/skills/
# … see .agents/modules/README.md

# 4. Verify harness shape
node .harness/scripts/check-invariants.mjs

# 5. Start Discovery — create .harness/specs/<slice>/intent.md
```

Read [AGENTS.md](AGENTS.md) every session. Portability model: [docs/asdd-harness-portability.md](docs/asdd-harness-portability.md).

## What's included

| Layer | Contents |
|-------|----------|
| **A. Kit core** | `@asdd-*` pipeline agents, product/spec skills, portable steering, empty state, `check-invariants` |
| **B. Modules** | Bruno, Playwright, web-UI, HTTP-API under `.agents/modules/` (opt-in) |
| **C. Bindings** | Stub `product.md`, `structure.md`, `tech.md`, `*.project.md` — **rewrite these** |
| **D. Runtimes** | Recipes under `runtimes/` (Cursor, Claude Code, …) |

## What is not included

- Product history (specs, progress, features of another app)
- Framework-specific boundary scripts (e.g. Nx `layer:*`) — add your own in `domain-layer.project.md`
- Draftly / Nest / Slack content

## Requirements

- Node.js (for `check-invariants.mjs` and MCP launchers) on the **agent host** machine
- [codegraph](https://www.npmjs.com/package/codegraph) recommended (`npm i -g codegraph`)
- An IDE that can load agents from `.agents/` or via runtime symlinks

## License

MIT — see [LICENSE](LICENSE).
