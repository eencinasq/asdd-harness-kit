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

# 4. Verify project adapter and harness shape
node .harness/scripts/check-project-config.mjs
node .harness/scripts/check-invariants.mjs

# 5. Start Discovery — create .harness/specs/<slice>/intent.md
```

Read [AGENTS.md](AGENTS.md) every session. Portability model: [docs/asdd-harness-portability.md](docs/asdd-harness-portability.md). Orca same-slice task orchestration: [docs/orca-task-orchestration.md](docs/orca-task-orchestration.md).


## Add to an existing project

```bash
# From a local clone of this kit:
./scripts/install-into.sh /path/to/existing-repo \
  --modules=http-api,web-ui \
  --runtime=cursor

# Multiple runtimes can be wired in one pass:
./scripts/install-into.sh /path/to/existing-repo \
  --runtime=opencode,kimi,junie,devin,kiro

# Or one-liner (clones kit to a temp dir):
curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
  | bash -s -- /path/to/existing-repo --from-git --modules=http-api --runtime=cursor
```

Safe by default: does **not** overwrite existing bindings, `PROGRESS.md`, slice state, specs, or `mcp.json`.

| Flag | Effect |
|------|--------|
| `--modules=…` | Enable opt-in modules (`bruno`, `playwright-e2e`, `web-ui`, `http-api`, or `all`) |
| `--runtime=cursor`, `claude`, `opencode`, `kimi`, `junie`, `devin`, `kiro` | Symlink agents/skills/MCP into the runtime folder |
| `--force` | Refresh portable contracts/agents/skills already present |
| `--force-bindings` | Overwrite binding stubs (dangerous) |
| `--dry-run` | Print actions only |

Smoke test: `./scripts/test-install-into.sh`

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
