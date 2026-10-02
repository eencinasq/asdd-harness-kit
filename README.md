# asdd-harness-kit

A portable process layer for **Agent Specification-Driven Development (ASDD)** and **Harness Engineering**.

It gives AI agents a governed pipeline — from product discovery through implementation, QA, and knowledge capture — with session locks, file-scope enforcement, verification gates, and traceability. You bring your own stack (Python, Go, Rails, Next.js, Nest, …). The kit brings the process.

---

## What this is

| Concern | What the kit provides | What you provide |
|---|---|---|
| **Process** | 9-phase ASDD pipeline, agent definitions, skills catalog, steering contracts | Product intent, domain language, technology choices |
| **Execution control** | Session locks, feature trackers, progress records, invariant checks | Mapped file scopes, verification commands |
| **Quality gates** | EARS criteria templates, CCS cutoffs, gate definitions | Test suites, failure logs, active findings |
| **Runtime adapters** | Symlinks and configs for Cursor, Claude, OpenCode, Kimi, Junie, Devin, Kiro | Your IDE/editor |

**ASDD** answers *which phase* and *which spec artifact*.  
**Harness** answers *which feature* is under test now, which files may change, and what evidence is required before work is called done.

Pipeline phases: `Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge`

For small work, use **ASDD-Lite**: `Spec → Design → Tasks → Implementation → QA-Lite`.

---

## Two ways to use this kit

### 1. Add to an existing project (recommended)

#### Via npx (no install, no clone)

```bash
# Interactive wizard (prompts for target, runtimes, modules)
npx asdd-harness-kit

# Non-interactive with explicit flags
npx asdd-harness-kit /path/to/existing-repo \
  --modules=http-api,web-ui \
  --runtime=cursor

# Multiple runtimes in one pass
npx asdd-harness-kit /path/to/existing-repo \
  --runtime=opencode,kimi,junie,devin,kiro

# If the package is not yet on npm, use the GitHub source directly:
npx github:eencinasq/asdd-harness-kit /path/to/existing-repo --runtime=cursor
```

#### Via local clone

```bash
# From a local clone of this kit:
./scripts/install-into.sh /path/to/existing-repo \
  --modules=http-api,web-ui \
  --runtime=cursor

# Or one-liner (clones kit temporarily):
curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
  | bash -s -- /path/to/repo --from-git --modules=http-api --runtime=cursor
```

**Safe by default:** never overwrites existing bindings, `PROGRESS.md`, slice state, specs, or `mcp.json`.

| Flag | Effect |
|------|--------|
| `-i, --interactive` | Prompt for target, runtimes, modules (default in TTY) |
| `--no-interactive` | Never prompt, even in TTY |
| `--modules=…` | Enable modules: `bruno`, `playwright-e2e`, `web-ui`, `http-api`, or `all` |
| `--runtime=…` | Wire runtime: `cursor`, `claude`, `opencode`, `kimi`, `junie`, `devin`, `kiro` |
| `--force` | Refresh portable contracts/agents/skills already present |
| `--force-bindings` | Overwrite binding stubs (**dangerous**) |
| `--dry-run` | Preview actions without applying |

Smoke test: `./scripts/test-install-into.sh` or `npm test`

### Version-aware updates

Every installable artifact is tracked in `.harness/config/versions.json` (kit source) and `.harness/config/installed-versions.json` (target project). When you re-run the installer:

- **New files** are created.
- **Changed files** (version mismatch) are refreshed.
- **Unchanged files** are kept.
- `--force` overrides version checks and refreshes all portable files.

To bump a version after editing an artifact:

```bash
node scripts/generate-versions.mjs bump .harness/steering/session-loop.md 2.0.1
```

Then re-run the installer in dependent projects.

### 2. Use as a template for a new project

```bash
# GitHub "Use this template", or:
git clone https://github.com/eencinasq/asdd-harness-kit.git my-project
cd my-project

# 1. Fill project bindings (required — stubs are not product truth)
$EDITOR .harness/steering/product.md
$EDITOR .harness/steering/structure.md
$EDITOR .harness/steering/tech.md
$EDITOR .harness/steering/domain-layer.project.md
$EDITOR .harness/steering/quality-gates.project.md

# 2. Verify
node .harness/scripts/check-project-config.mjs
node .harness/scripts/check-invariants.mjs

# 3. Scaffold your first slice
node .harness/scripts/init-slice.mjs my-first-slice

# 4. Check project status at any time
node .harness/scripts/harness-status.mjs

# 5. Start Discovery — write .harness/specs/<slice>/intent.md
```

---

## What's inside

### Agents (`.agents/agents/`)
ASDD pipeline agents: Discovery, Spec, Validation, Domain, Design, Task Planning, Implementation, QA, Knowledge, Refactor, and Lite. Each is a runtime-agnostic markdown definition consumed by your IDE.

### Skills (`.agents/skills/`)
Reusable capabilities: Shape Up, Product Delivery, Test-Driven Development, API Design, User-Story Decomposition, Capability Prioritization, Domain-Language Extraction, Documentation & ADRs, Open Code Review, Anti-Pattern Detection, and Business Model Canvas.

### Steering contracts (`.harness/steering/`)
| File | Purpose |
|------|---------|
| `product.md` | Product description and actors |
| `structure.md` | Directory layout and boundary rules |
| `tech.md` | Technology stack and conventions |
| `domain-layer.md` / `domain-layer.project.md` | Domain boundaries and ubiquitous language |
| `quality-gates.md` / `quality-gates.project.md` | EARS criteria, test commands, active findings |
| `controls.md` | Precedence order when guides conflict |
| `session-loop.md` | Session open/close rules, file scope, locks |
| `manifest.md` | Per-slice phase machine definition |
| `codegraph.md` | Code intelligence conventions |
| `templates/` | Standard artifact templates for consistent cross-agent handoffs |

### Harness scaffold (`.harness/`)
- `scripts/` — invariant checks, project config validation, skills index sync, verify-on-stop, status dashboard, slice initializer
- `scripts/validators/` — modular validators consumed by `check-invariants.mjs`
- `steering/templates/` — artifact templates for every ASDD phase (intent, capability, requirements, design, tasks, reports)
- `state/` — global manifest, per-slice manifests, locks
- `specs/` — slice specifications
- `features/` — session feature trackers (with JSON schema)
- `progress/` — session records
- `PROGRESS.md` — active slices index

### Modules (`.agents/modules/` — opt-in)
- **bruno** — integration testing agent
- **playwright-e2e** — end-to-end testing agent
- **web-ui** — UI skills
- **http-api** — API design skills

### Runtime recipes (`runtimes/`)
Configuration for Cursor, Claude Code, OpenCode, Kimi Code, Junie, Devin, and Kiro. The installer symlinks agents/skills/MCP into each IDE's folder. Runtime recipes stay in this kit and are not copied into consuming repositories.

---

## How a session works

1. **Read** `.harness/PROGRESS.md` and the slice manifest
2. **Check the lock** — `.harness/state/locks/<slice-id>.lock`
3. **Read steering** for the current phase
4. **Pick work** — dependency-ready features
5. **Edit only mapped files** — scope defined by the active spec
6. **Verify before close** — `node .harness/scripts/check-invariants.mjs` must exit 0
7. **Record evidence** — no feature is `passing` without verification + evidence

Operational CLIs:
- `node .harness/scripts/harness-status.mjs` — active slices, locks, features in progress
- `node .harness/scripts/init-slice.mjs <slice-id>` — scaffold a new slice with manifest, specs, features, and progress tracking
- `node .harness/scripts/check-invariants.mjs` — full harness invariant validation

Read [`AGENTS.md`](AGENTS.md) every session for the full operational map.

---

## Shape Up integration (optional)

For teams using Basecamp's Shape Up methodology, the kit includes a [`shape-up`](.agents/skills/shape-up/SKILL.md) skill and a full integration guide:

```
Idea → Pitch → Bet → ASDD Discovery → … → Harness Implementation → QA → Knowledge
```

- **Shape Up** decides *which work* deserves a fixed appetite
- **ASDD** provides the specification pipeline and phase gates
- **Harness** enforces execution scope, locks, and evidence

See [`docs/shape-up-asdd-harness-integration.md`](docs/shape-up-asdd-harness-integration.md) and the Product Delivery → ASDD handoff in [`.agents/skills/product-delivery/references/asdd-harness-handoff.md`](.agents/skills/product-delivery/references/asdd-harness-handoff.md).

---

## Requirements

- **Node.js** — for invariant checks, project config validation, and MCP launchers
- **git** — for the installer when using `--from-git`
- **[codegraph](https://www.npmjs.com/package/codegraph)** — recommended for code intelligence (`npm i -g codegraph`)
- An IDE that can load agents from `.agents/` or via runtime symlinks

---

## Documentation

| Document | What it covers |
|----------|----------------|
| [`AGENTS.md`](AGENTS.md) | Operational map — read every session |
| [`docs/asdd-and-harness-engineering.md`](docs/asdd-and-harness-engineering.md) | Guides, sensors, session close, what "done" means |
| [`docs/asdd-harness-portability.md`](docs/asdd-harness-portability.md) | How the kit maps to product repos, adopter checklist |
| [`docs/pipeline-documentation.md`](docs/pipeline-documentation.md) | Full delivery pipeline: Shape Up → Product Delivery → ASDD + Harness |
| [`docs/shape-up-asdd-harness-integration.md`](docs/shape-up-asdd-harness-integration.md) | Using Shape Up pitches with ASDD slices |
| [`runtimes/README.md`](runtimes/README.md) | Per-IDE wiring instructions |

---

## License

MIT — see [LICENSE](LICENSE).
