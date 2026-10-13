# asdd-harness-kit

A portable process layer for **Agent Specification-Driven Development (ASDD)** and **Harness Engineering**.

It gives AI agents a governed pipeline — from Shape Up through implementation, QA, and knowledge capture — with skill-scoped Jev System One gates (shape-up / product-delivery), feature trackers, file-scope enforcement, verification evidence, and traceability. You bring your own stack (Python, Go, Rails, Next.js, Nest, …). The kit brings the process.

---

## What this is

| Concern | What the kit provides | What you provide |
|---|---|---|
| **Process** | 9-phase ASDD pipeline, agent definitions, skills catalog, steering contracts | Product intent, domain language, technology choices |
| **Execution control** | Append-only sessions, feature trackers, generated manifests, invariant checks | Mapped file scopes, verification commands |
| **Quality gates** | EARS templates, Jev MCP (shape-up / product-delivery), Harness invariants | Test suites, failure logs, `JEV_API_KEY` when shaping/delivering |
| **Runtime adapters** | Symlinks and configs for Cursor, Claude, OpenCode, Kimi, Junie, Devin, Kiro | Your IDE/editor |

**ASDD** answers *which phase* and *which spec artifact*.  
**Harness** answers *which feature* is under test now, which files may change, and what evidence is required before work is called done.

Full ASDD phases: `Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge`

**Slices are Lite-first.** Every slice starts in `lite` mode (Spec → Design → Tasks → Implementation → QA-Lite). `full` is opt-in (`init-slice.mjs --full`) for work known upfront to be cross-cutting or architectural. Growth in a lite slice is detected from session evidence — scope spread, domain growth, dissent, blockage — and **blocks completion until the slice is escalated**. See [`.harness/steering/asdd-lite.md`](.harness/steering/asdd-lite.md).

---

## Jev (skill-scoped)

TypeSafe System One is **required only** for `shape-up` and `product-delivery` (prefer the **`jev-gate` MCP**). Harness ASDD does **not** call Jev. Do not commit the key.

```text
Shape Up          MCP jev_status + jev_shape_up_gates (appetite ≥ 4, rabbit hole ≥ 0.80)
Product Delivery  MCP jev_status + jev_ears_gate (≥ 0.85) + jev_slice_choice
Trackers          overlapping scope_paths → features.mjs (not a Jev call)
Harness           pattern command gate + invariants (no System One)
```

```bash
export JEV_API_KEY="…"   # never commit; project.json apiKey must stay empty
# Prefer MCP tools when shaping / delivering. Shell fallback:
node .harness/scripts/jev-gates.mjs health
node .harness/scripts/check-invariants.mjs --live   # does not require JEV_API_KEY
```

Config: `capabilities.jev.required: false` with `required_by: ["shape-up","product-delivery"]`. Inside those skills, `unavailable` is never a pass. Steering: [`.harness/steering/jev.md`](.harness/steering/jev.md). Guide: [`docs/jev-integration.md`](docs/jev-integration.md).

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

**Safe by default:** never overwrites existing bindings, slice state, specs, or `mcp.json`.

| Flag | Effect |
|------|--------|
| `-i, --interactive` | Prompt for target, runtimes, modules (default in TTY) |
| `--no-interactive` | Never prompt, even in TTY |
| `--modules=…` | Enable modules: `bruno`, `playwright-e2e`, `web-ui`, `http-api`, or `all` |
| `--runtime=…` | Wire runtime: `cursor`, `claude`, `opencode`, `kimi`, `junie`, `devin`, `kiro` |
| `--force` | Refresh portable contracts/agents/skills already present |
| `--force-bindings` | Overwrite binding stubs (**dangerous**) |
| `--dry-run` | Preview actions without applying |

Test suite: `npm test` — installer smoke test (all runtimes and modules), lifecycle e2e (slice state machine incl. negative invariant cases), and unit tests for the Jev client, command gate, and MCP gate server.
Full pipeline e2e: `npm run test:full-flow` — Shape Up → Product Delivery → lite slice → evidence → escalation → DONE → verify-on-stop. With `JEV_API_KEY` set, shape-up/product-delivery Jev gates run **live**; without it those stages are skipped (harness stages still run — they do not call Jev).

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

# 1. Fill project bindings (stubs are not product truth)
$EDITOR .harness/steering/product.md
$EDITOR .harness/steering/structure.md
$EDITOR .harness/steering/tech.md
$EDITOR .harness/steering/domain-layer.project.md
$EDITOR .harness/steering/quality-gates.project.md

# 2. Jev (for shape-up / product-delivery)
export JEV_API_KEY="…"   # optional until you run those skills
# Prefer jev-gate MCP; shell fallback:
# node .harness/scripts/jev-gates.mjs health

# 3. Verify
node .harness/scripts/check-project-config.mjs
node .harness/scripts/check-invariants.mjs

# 4. First slice (lite by default; --full for cross-cutting/architectural work)
node .harness/scripts/init-slice.mjs my-first-slice
node .harness/scripts/harness-status.mjs

# 5. Write .harness/specs/<slice>/intent.md (Lite: spec.md)
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
| `jev.md` | Skill-scoped Jev (shape-up / product-delivery MCP) |
| `controls.md` | Precedence order when guides conflict |
| `session-loop.md` | Session open/close, file scope, evidence (no v2 locks) |
| `manifest.md` | Per-slice phase machine definition |
| `codegraph.md` | Code intelligence conventions |
| `templates/` | Standard artifact templates for consistent cross-agent handoffs |

### Harness scaffold (`.harness/`)
- `scripts/` — invariants, Jev client/gates (skill library), pattern command-gate, project config, skills index, verify-on-stop, status, init-slice, escalate-slice, sync-state
- `scripts/validators/` — modular validators consumed by `check-invariants.mjs`
- `steering/templates/` — artifact templates for every ASDD phase (intent, capability, requirements, design, tasks, reports)
- `state/` — global registry, per-slice manifests (generated), append-only session logs
- `specs/` — slice specifications
- `features/` — session feature trackers (with JSON schema)
- `progress/` — legacy session records (v2; deprecated in v3)
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

1. **Read** generated `.harness/state/registry.json` for squad state
2. **Read** generated `.harness/state/slices/<slice-id>/manifest.json` for the target slice (mode, phase, escalation signals)
3. **Read steering** for the current phase
4. **Pick work** — dependency-ready features; lite slices are serial (one `in_progress` at a time)
5. **Edit only mapped files** — scope defined by the active spec
6. **Write session file** — append-only log of every significant action
7. **Run sync-state** — regenerate manifest and registry
8. **Verify before close** — `node .harness/scripts/check-invariants.mjs` must exit 0
9. **Record evidence** — no feature is `passing` without verification + evidence
10. **Escalate when evidence demands it** — open escalation signals on a lite slice block `DONE` until `escalate-slice.mjs` acknowledges them

Operational CLIs:
- `node .harness/scripts/harness-status.mjs` — active slices, modes, features in progress, escalation signals
- `node .harness/scripts/init-slice.mjs <slice-id> [--full]` — scaffold a new slice (lite by default)
- `node .harness/scripts/escalate-slice.mjs <slice-id> --reasons "<triggers>"` — transition lite → escalated
- `node .harness/scripts/sync-state.mjs [--slice <id>]` — regenerate manifests and registry from append-only session logs (`--slice` merges into the registry)
- `node .harness/scripts/check-invariants.mjs [--live]` — harness invariants (no System One; `--live` used by verify-on-stop)
- `node .harness/scripts/jev-client.mjs status|health` — Jev client (shape-up / product-delivery)
- `node .harness/scripts/jev-gates.mjs health` — live System One probe for those skills
- `node .harness/scripts/jev-command-gate.mjs` — pattern command gate hook entrypoint (Cursor / Claude Code)

Read [`AGENTS.md`](AGENTS.md) every session for the full operational map.

---

## Shape Up + Product Delivery

Shape Up and Product Delivery are the intake for this kit, not an optional extra. Jev MCP gates on those skills are required (see [`.harness/steering/jev.md`](.harness/steering/jev.md)). Harness ASDD does not call Jev.

```
Idea → Pitch (MCP jev_shape_up_gates) → Bet → Product Delivery (MCP jev_ears_gate + jev_slice_choice)
    → ASDD Discovery → … → Harness Implementation (pattern command gate) → QA → Knowledge
```

- **Shape Up** decides *which work* deserves a fixed appetite
- **ASDD** provides the specification pipeline and phase gates
- **Harness** enforces execution scope, session logging, and evidence

See [`docs/shape-up-asdd-harness-integration.md`](docs/shape-up-asdd-harness-integration.md) and the Product Delivery → ASDD handoff in [`.agents/skills/product-delivery/references/asdd-harness-handoff.md`](.agents/skills/product-delivery/references/asdd-harness-handoff.md).

---

## Requirements

- **Node.js 18+** — harness scripts and Jev client
- **`JEV_API_KEY`** — required when running shape-up / product-delivery (MCP or `jev-gates.mjs health`)
- **git** — installer `--from-git`
- **[codegraph](https://www.npmjs.com/package/codegraph)** — recommended (`npm i -g codegraph`)
- An IDE that can load agents from `.agents/` or via runtime symlinks

---

## Documentation

| Document | What it covers |
|----------|----------------|
| [`AGENTS.md`](AGENTS.md) | Operational map — read every session |
| [`docs/asdd-and-harness-engineering.md`](docs/asdd-and-harness-engineering.md) | Guides, sensors, session close, what "done" means |
| [`docs/asdd-harness-portability.md`](docs/asdd-harness-portability.md) | How the kit maps to product repos, adopter checklist |
| [`docs/jev-integration.md`](docs/jev-integration.md) | Skill-scoped Jev MCP wiring, commands, thresholds |
| [`docs/pipeline-documentation.md`](docs/pipeline-documentation.md) | Idea → Shape Up → Product Delivery → ASDD + Harness |
| [`docs/shape-up-asdd-harness-integration.md`](docs/shape-up-asdd-harness-integration.md) | Using Shape Up pitches with ASDD slices |
| [`runtimes/README.md`](runtimes/README.md) | Per-IDE wiring instructions |

---

## License

MIT — see [LICENSE](LICENSE).
