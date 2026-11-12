# asdd-harness-kit

A portable process layer for **Agent Specification-Driven Development (ASDD)** and **Harness Engineering**.

It gives AI agents a governed pipeline — from shaping an idea through implementation, QA, and knowledge capture — with feature trackers, file-scope enforcement, verification evidence, spec-drift sensors, and traceability. You bring your own stack (Python, Go, Rails, Next.js, Nest, …). The kit brings the process.

**Contents:** [What this is](#what-this-is) · [Install](#install) · [How a session works](#how-a-session-works) · [Delivery pipeline](#delivery-pipeline) · [Jev MCP](#jev-mcp-server-not-installable) · [Spec drift and codebase audit](#spec-drift-and-codebase-audit) · [Self-improving harness](#self-improving-harness) · [Principles](#principles) · [What's inside](#whats-inside) · [Requirements](#requirements) · [Documentation](#documentation) · [Developing the kit](#developing-the-kit)

---

## What this is

| Concern | What the kit provides | What you provide |
|---|---|---|
| **Process** | 9-phase ASDD pipeline, agent definitions, skills catalog, steering contracts | Product intent, domain language, technology choices |
| **Execution control** | Append-only sessions, feature trackers, generated manifests, invariant checks | Mapped file scopes, verification commands |
| **Quality gates** | EARS templates, Harness invariants, shaping and delivery gates (human-decided, `decided_by`) | Test suites, failure logs |
| **Spec drift and audit** | Drift checks in the invariants and CI, codebase auditor, `spec-drift` MCP server with a dashboard | Architecture gate command, audit commands, OpenAPI contract (optional bindings) |
| **Knowledge** | Generated index of specs, requirements, features, and sessions, queried through the `knowledge` MCP server | Optional embeddings endpoint |
| **Runtime adapters** | Agent files rendered with each agent's tool envelope for Claude Code, Cursor, and OpenCode; links for Kimi, Junie, Devin, Kiro; hooks and MCP config | Your IDE or agent runtime |

**ASDD** answers *which phase* and *which spec artifact*.
**Harness** answers *which feature* is under test now, which files may change, and what evidence is required before work is called done.

| Question | System | Artifact |
|----------|--------|----------|
| ASDD phase? | ASDD | `.harness/state/slices/<id>/manifest.json` |
| Which slices? | Harness index | `.harness/PROGRESS.md` + `.harness/state/registry.json` |
| Which TASK now? | Harness | `.harness/features/<id>.features.json` |
| Who may write? | Feature scopes | `owner` + disjoint `scope_paths` on in-progress features |
| Which product files? | Active spec | `.harness/specs/<slice>/intent.md` (Lite: `spec.md`) plus the paths that spec, `design.md`, `tasks.md`, and the in-progress `scope_paths` name |
| Which control wins? | Precedence | `.harness/steering/controls.md` |

Full ASDD phases: `Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge`

**Slices are Lite-first.** Every slice starts in `lite` mode (`Spec → Design → Tasks → Implementation → QA-Lite`). `full` is opt-in (`asdd slice init --full`) for work known upfront to be cross-cutting or architectural. Growth in a lite slice is detected from session evidence and **blocks completion until the slice is escalated** ([escalation](#lite-first-and-escalation)).

---

## Install

### Getting started

Steps 1 to 3 are once per machine (every developer does them); steps 4 and 5 are once per repository (one person does them); after that, the harness is part of the repository. The `asdd` CLI is never copied into a repository: it is installed on the machine (or as a project devDependency), and the repository receives only its harness files.

#### 1. Check the prerequisites

| You need | Check it with | Why |
|---|---|---|
| Node.js 22 or newer | `node -v` | the `asdd` CLI runs on Node (22.5+ for the SQLite knowledge index) |
| git | `git --version` | spec drift, `--pr`, `--from-git` |
| A POSIX shell | macOS, Linux, WSL, or Git Bash | the Cursor and Claude Code hooks |
| An agent runtime | Cursor, Claude Code, OpenCode, Kimi, Junie, Devin, or Kiro | the sessions the harness governs |
| GitHub CLI, signed in (optional) | `gh auth status` | only for `asdd install --pr` |

#### 2. Install the CLI (once per machine)

When the package is on npm:

```bash
npm i -g asdd-harness-kit
```

Until then, build it from this repository:

```bash
git clone https://github.com/eencinasq/asdd-harness-kit.git
cd asdd-harness-kit
npm install                                   # build tools only (esbuild); the CLI has no runtime dependencies
npm pack                                      # builds cli/dist/ (prepack) and writes asdd-harness-kit-<version>.tgz
npm i -g ./asdd-harness-kit-<version>.tgz
```

Check it: `asdd --version` prints the version. If the shell answers `asdd: command not found`, the folder where npm puts global commands is not on your PATH: `npm prefix -g` shows it, and its `bin` folder must be on the PATH of the terminal (and the IDE) that runs your agent, because the hooks call `asdd`. With nvm, install it under the Node version that terminal uses.

#### 3. Check the machine

```bash
asdd doctor
```

Every line should start with `ok` (or `warn` for optional tools such as semgrep and codegraph). Each `FAIL` line says what to run.

#### 4. Add the harness to a repository (once per repository)

```bash
cd ~/code/your-repo
git switch main && git pull && git status       # start from a clean default branch

asdd install . --runtime=cursor,claude --pr     # a branch and a pull request with the harness files (git + gh)
asdd install . --runtime=cursor                 # or install into the working tree and commit it yourself
asdd install --interactive                      # or a wizard: target, runtimes, modules
```

It writes `.harness/` (steering, bindings, config, state), `.agents/` (agents, skills, MCP config), `AGENTS.md`, the runtime wiring and hooks, and a few `.gitignore` lines. It refuses, before writing anything, when the repository's ignore rules would keep harness files out of git. Review the pull request (or `git diff`), then merge it.

**Optional, for Node projects: pin the version.** `npm i -D asdd-harness-kit` in the repository makes the hooks, `npx asdd`, and any global `asdd` run that exact version (from the lockfile). Without it, each machine's global `asdd` runs, and it must fit the kit version the repository installed (`kit.version` in `.harness/config/project.json`): another major is refused, another minor warns.

#### 5. Fill the bindings and start

Fill the project bindings in `.harness/steering/` (`product`, `structure`, `tech`, `domain-layer.project`, `quality-gates.project`; stubs are not product truth), run `asdd check-config` and `asdd check`, then create the first slice ([adopter checklist](#adopter-checklist)).

#### Other developers of the same repository

Each one does steps 1 to 3 on their machine and pulls the default branch. The repository already has the harness. Its hooks find `asdd` on their own: the project's devDependency first, else the global one.

#### Updating

```bash
npm i -g asdd-harness-kit@latest              # or install the newer .tgz (step 2)
cd ~/code/your-repo && asdd install . --pr    # the repository's harness files, as a pull request
```

A kit file the repository changed is left as it is (`SKIP`, listed by `asdd doctor`; `--force` takes the kit version). Projects installed by an older kit lose their copy of the CLI (`.harness/cli/`), `scripts/install-into.sh`, and the kit files in `.harness/scripts/`, and their hooks move to the resolver.

#### Removing it

`asdd uninstall .` removes from a repository only what the kit added and the repository did not change (specs, features, state, filled bindings, and every changed file stay). `npm rm -g asdd-harness-kit` removes the command.

#### Troubleshooting

| You see | Do this |
|---|---|
| `asdd: command not found` | put npm's global `bin` folder on your PATH (step 2) |
| a hook says `asdd is not installed: npm i -D asdd-harness-kit (or npm i -g asdd-harness-kit)` | install the CLI (step 2), then restart the IDE so its hooks see the new PATH |
| `asdd X cannot run this project, installed with kit Y` | install the matching version (`npm i -g asdd-harness-kit@Y`), or upgrade the repository with yours (`asdd install .`) |
| `⚠ asdd X differs from the kit Y this project installed` | the same, when convenient: another minor still runs |
| `the project's ignore rules hide harness files the team must commit` | remove those `.gitignore` rules (`git check-ignore -v <path>` shows each), or pass `--force` |
| `an earlier install was interrupted (.harness/.installing is still there)` | review `git status`, then `asdd install . --force` to finish it |
| `the project has asdd-harness-kit X, newer than this CLI` | update the CLI (see Updating); `--force` downgrades |
| `The working tree has uncommitted or untracked changes` (with `--pr`) | commit or stash, then run it again |
| `The GitHub CLI is missing or not signed in` (with `--pr`) | `gh auth login` |
| `jev is not an installable module` | Jev is only the [`jev-gate` MCP server](#jev-mcp-server-not-installable) in this repository |

#### Other ways to run the installer

```bash
npx asdd-harness-kit install /path/to/repo --runtime=cursor               # without a global install (from npm)
npx github:eencinasq/asdd-harness-kit install /path/to/repo --runtime=cursor  # without npm publishing
node cli/bin/asdd.mjs install /path/to/repo --runtime=cursor              # from a clone of this kit
```

The pre-CLI form `npx asdd-harness-kit /path/to/repo …` still installs. How `asdd` is found and pinned in a repository: [`cli/README.md`](cli/README.md#where-asdd-comes-from).

### `asdd install` options

| Flag | Effect |
|------|--------|
| `-i, --interactive` / `--no-interactive` | Prompt for target, runtimes, modules (default in a TTY) / never prompt |
| `--modules=…` | `bruno`, `playwright-e2e`, `web-ui`, `http-api`, or `all` (Jev is not a module: [Jev MCP server](#jev-mcp-server-not-installable)) |
| `--from-git` / `--kit-dir <path>` | Install from a fresh clone of the kit / from another kit checkout |
| `--runtime=…` | `cursor`, `claude`, `opencode`, `kimi`, `junie`, `devin`, `kiro` |
| `--force` | Refresh every kit-owned file, ignoring versions |
| `--force-bindings` | Overwrite project binding files (**dangerous**) |
| `--force-mcp` | Replace `.agents/mcp/mcp.json` with the empty project seed |
| `--skip-bindings` / `--skip-docs` | Skip binding stubs / `AGENTS.md` and docs (`--skip-deps` is accepted and does nothing: the harness installs no npm packages) |
| `--dry-run` | Preview actions without applying them |
| `--pr` | Install on a new branch from `origin/<default>`, commit, push, and open a pull request with `gh` |
| `--json` | One JSON object on stdout (result or error) for tools and CI |

An unknown module or runtime fails before anything is written.

**Safe by default.** Project-owned files — bindings, `AGENTS.md`, slice state, specs, logs, and `mcp.json` — are created once and never overwritten. A kit file the project changed is left as it is on upgrade (`--force` takes the kit version), an interrupted install or an older kit is refused, and `asdd uninstall <dir>` removes only what the kit added and the project did not change ([`cli/README.md`](cli/README.md)). Kit tests and the kit's design notes stay in this repository.

### How the kit maps to a product repo

| Layer | Where |
|-------|-------|
| **A. Kit core** | This repository |
| **B. Modules** | Optional modules stay in the kit and are copied only when enabled |
| **C. Bindings** | `.harness/steering/{product,structure,tech,*.project}.md` stubs |
| **D. Runtimes** | Runtime adapters maintained in this kit under `cli/runtimes/` |

Do not copy from another product monorepo: specs, `PROGRESS.md` history, filled `product`/`structure`/`tech` bindings, or stack-specific boundary scripts.

### Adopter checklist

1. Install the kit (above) or use it as a template (below).
2. Fill all required bindings.
3. Install the runtime links you use with `--runtime=…`. Runtime recipes stay in this kit and are not copied into product repos.
4. Enable modules with `asdd install <dir> --modules=<list>`.
5. Validate the generated adapter: `asdd check-config`.
6. Validate Harness state: `asdd check`. This also checks that `.harness/steering/skills.md` lists only the name and description of each folder under `.agents/skills/`.
7. Fill `quality-gates.project.md` before Discovery: the full-suite command, the failure-log path, and `Active findings` (`none` or real rows). A stub blocks the gate that needs it.
8. With `--runtime=cursor`, confirm `.cursor/hooks.json` runs `asdd verify` on `stop` and `asdd gate` on `beforeShellExecution`. With `--runtime=claude`, confirm `.claude/settings.json` registers the same two commands on `Stop` and `PreToolUse` (Bash).
9. Optional spec drift and audit bindings in `quality-gates.project.md` (`Test file globs`, `Drift base branch`, `Audit commands`, `Contract command`, `OpenAPI spec`) and the `Gate command` in `domain-layer.project.md`. Unfilled ones report `unconfigured`. Keep `drift.contract: "warn"` in `project.json` until every feature has `scope_paths` and `passing` features have `evidence`, then set `"fail"` ([spec drift](#spec-drift-and-codebase-audit)).
10. Create the first slice via Discovery or ASDD-Lite.

The knowledge index (spec/session/feature graph + searchable chunks) regenerates at the end of every `asdd sync` run, or manually with `asdd knowledge sync`. Agents query it with `asdd knowledge` (`search`, `trace`, `slice`, `status`, `patterns`). The optional `knowledge` MCP server lives only in this kit ([`tools/knowledge/`](tools/knowledge/README.md)); `asdd install` does not copy `tools/` into projects. The index lives under `.harness/knowledge/` (generated — keep it gitignored).

### Updates and versions

The kit has **one version**: `package.json`. Every artifact the installer copies carries that version in `cli/versions.json` (installed as `.harness/config/versions.json`), and the target records what it received in `.harness/config/installed-versions.json`. Re-running the installer refreshes every kit-owned file whose version changed, so a release reaches every file — nothing stays stale because one file was not bumped.

```bash
node cli/bin/asdd.mjs kit versions bump 3.10.0  # set package.json + lock, restamp every artifact
node cli/bin/asdd.mjs kit versions              # restamp at the current version (npm run versions)
```

Then re-run the installer in dependent projects. `npm test` fails when an artifact's version differs from the project version, or when the installer refreshes a file that has no version entry.

**Upgrading to 3.10.** Re-running `asdd install .` replaces the agent links under `.claude/agents/`, `.cursor/agents/`, and `.opencode/agents/` with rendered files (see [Agents and their tool envelopes](#agents-and-their-tool-envelopes)); edit `.agents/agents/`, never the rendered copies. The QA agent no longer generates tests or peer-reviews specs, and the `spec-peer-review.md` template is gone.

### Use as a template for a new project

```bash
git clone https://github.com/eencinasq/asdd-harness-kit.git my-project && cd my-project

# 1. Fill the project bindings (stubs are not product truth)
$EDITOR .harness/steering/{product,structure,tech,domain-layer.project,quality-gates.project}.md

# 2. Verify (no global asdd: node cli/bin/asdd.mjs <command>)
asdd check-config
asdd check

# 3. First slice (lite by default; --full for cross-cutting work), then write its spec
asdd slice init my-first-slice
asdd status
```

The clone carries the kit's own slices, features, and bindings; replace them with yours.

### Kit tests

- `npm test` — builds `cli/dist`, checks the vendored server libraries and the kit's self-install copies are current, then runs the installer smoke test (all runtimes and modules, upgrades, uninstall, the npm package contents, and an install from the packed tarball as people install it: `npm pack`, `npm i -g`, `asdd install`, the hooks), lifecycle e2e (slice state machine with negative invariant cases), and unit tests for the CLI, drift, audit, Semgrep, knowledge, the learning loop, and the `openapi` adapter. It also runs `asdd kit skills-lint` and `asdd kit agents-lint` (the grammar every shipped skill and agent must follow) with their tests.
- `npm run test:full-flow` — Shape Up → Product Delivery → lite slice → evidence → escalation → DONE → Verify-on-Stop.
- MCP servers — `pnpm typecheck && pnpm lint && pnpm test` inside each `tools/<name>/`.

---

## How a session works

Read [`AGENTS.md`](AGENTS.md) every session. The loop:

1. **Read** `.harness/state/registry.json` (squad state) and the target slice's `manifest.json` (mode, phase, escalation signals).
2. **Read steering** for the current phase (`inclusion: always` files, plus `auto` files whose tags match).
3. **Pick work** — dependency-ready features; lite slices are serial (one `in_progress`).
4. **Edit only mapped files** — the paths named by the active spec, plus the feature's `scope_paths`.
5. **Write a session file** — an append-only log of every significant action — then run `asdd sync`.
6. **Verify before close** — `asdd check` must exit 0.
7. **Record evidence** — no feature is `passing` without its verification result and `evidence`; `asdd sync` records its `evidence_hash`.
8. **Escalate when evidence demands it** — open signals on a lite slice block `DONE` until `asdd slice escalate` acknowledges them.

On **Cursor**, `.cursor/hooks.json` runs the command gate on `beforeShellExecution` (fail-closed) and `asdd verify` on `stop`. On **Claude Code**, `.claude/settings.json` wires the same scripts to `PreToolUse` (Bash) and `Stop`. Both stop gates run `asdd check --live`, and a failure comes back as the next prompt. Other runtimes are advisory and rely on CI:

| Runtime | Command gate (pattern) | Verify-on-stop |
|---------|------------------------|----------------|
| Cursor | `beforeShellExecution` hook (fail-closed) | `stop` hook (fail-closed) |
| Claude Code | `PreToolUse`/`Bash` hook | `Stop` hook (loop-safe) |
| OpenCode, Kimi, Junie, Devin, Kiro | Advisory — run `asdd gate` before dangerous commands, or expose the `check_command_safety` MCP tool | Run `asdd check --live` before marking `passing`; a failing run is recorded as a learning signal |

| Command | Purpose |
|---|---|
| `asdd status` | Active slices, modes, features in progress, escalation signals |
| `asdd slice init <id> [--full]` | Scaffold a slice (lite by default) |
| `asdd slice escalate <id> --reasons "<triggers>"` | Lite → escalated |
| `asdd sync [--slice <id>]` | Regenerate manifests, registry, and the knowledge index from session logs |
| `asdd check [--live]` | Harness invariants, including spec drift (`--live` is used by Verify-on-Stop) |
| `asdd drift [--json]` | The drift checks on their own |
| `asdd audit` | Whole-codebase audit report |
| `asdd knowledge sync [--embed]` | Rebuild the knowledge index |
| `asdd learn [--all \| --signatures \| --export \| --propose <LP-id>]` | Learning patterns; signatures in use; lessons for the kit; scaffold a steering proposal |

All commands are `asdd <command>`: with a devDependency, `npx asdd <command>` (or a global `asdd`, which hands off to it). `asdd help` lists them.

### Guides, then sensors

A guide steers the agent before it edits. A sensor checks the result and, on failure, comes back as the next prompt so the agent can correct it before the session ends. The index, the regulation each control owns, and the precedence order are in [`.harness/steering/controls.md`](.harness/steering/controls.md).

| When | What runs | Contract |
|------|-----------|----------|
| Session start | Read `PROGRESS.md`, the slice manifest, features, and the steering for the phase, including `controls.md` | `AGENTS.md` |
| Before choosing a skill | The skills index exposes only each folder's name and description | `.harness/steering/skills.md` |
| When that task starts | Read `.agents/skills/<name>/SKILL.md`. Do not read `references/` until that body says to | `skills.md` |
| Before any product edit | Stay inside the files mapped to the active spec. Do not refactor unless the spec, the current task, or the slice phase `refactor` asks for it | `.harness/steering/session-loop.md` |
| At a full-ASDD phase gate | Apply EARS / coverage criteria in `quality-gates.md`. Lite skips those numeric gates | `.harness/steering/quality-gates.md` |
| Before a Shape Up bet or writing intents | Shaping and delivery gates: a human decision (`decided_by`) | `shape-up`, `product-delivery` skills |
| Dangerous bash | `asdd gate` pattern allow/deny — hook-wired on Cursor and Claude Code, both fail-closed; advisory elsewhere | `asdd gate` (`command-gate.mjs`) |
| In-progress diff vs spec | Deterministic scope mapping (`session-loop.md` + `features.mjs`) | `.harness/steering/session-loop.md` |
| Lite slice governance | Serial rule (one `in_progress`, FAIL) + escalation signals block `DONE` while open (`validators/lite-escalation.mjs`, `asdd sync`) | `.harness/steering/asdd-lite.md` |
| Before `passing` or session end | `asdd check` must exit 0. WARN does not block. FAIL does | `session-loop.md` |
| Session end gate | Cursor stop hook and Claude Code Stop hook run `asdd verify` → `asdd check --live`; a failing check is returned as the next prompt (Cursor `loop_limit` 3; Claude respects `stop_hook_active`). Abort and error statuses do not continue the loop | `.cursor/hooks.json`, `.claude/settings.json` |
| Before `passing` (engineers) and PR review (Tech Lead) | Spec drift `DRIFT-01`…`07` runs inside the invariants; agents run `asdd drift` on demand, and `audit_diff` on the `spec-drift` MCP server gives the same findings in chat, in `author` or `review` mode | `.harness/steering/spec-drift.md` |
| Pull request | `.github/workflows/harness-invariants.yml` runs unit tests, installer smoke, lifecycle e2e with negative cases, config/skills checks, and `asdd sync` + `asdd check` (with the PR branch and body for `DRIFT-07`) | CI |
| On a schedule | `asdd audit` (drift over all slices, unowned code, audit commands, hotspots) and the `codebase-audit` skill; the Tech Lead triages | `.harness/audits/` |
| Before a new spec enters Task Planning | The full-suite command in `quality-gates.project.md` must report zero failures | `QG-DEB-*` |
| Choosing and running a skill or agent | Each one states when to use it and when not (`Use when` / `Do NOT use`), its boundary, a verification gate, and an escalation gate (HALT → Context → Options → Recommendation → Decision Needed); markers and the escalation format live in `skills.md` | `asdd kit skills-lint`, `asdd kit agents-lint` |
| Agent tool access | Each agent's `capabilities` (tier) are rendered into the runtime: auditors cannot edit, only the orchestrator spawns sub-agents, the researcher writes nothing | `.agents/agents/_runtime-template.md` |
| Same failure, override, or dismissal three times | `asdd learn` opens a pattern; a steering proposal names the guide or sensor to change. WARN while open, FAIL when the slice closes Knowledge | `QG-DEB-06`, `QG-LEARN-*` |

Fast checks stay at session stop. The more expensive suite stays on the Task Planning gate. CI repeats the invariants check after integration.

### What "done" means

A feature is `passing` only when its `verification` command has been run and the `evidence` field records that result, and the sensors for the session exit 0. A written summary is not evidence.

Session close:

1. Invariants exit 0 in live mode (structural harness checks).
2. No feature is `passing` without evidence.
3. The diff contains only mapped product files and the harness records the session loop allows (sessions, features, `PROGRESS.md` row).
4. The `PROGRESS.md` row matches the per-slice manifest.
5. Lite slices closing with open escalation signals are rejected — escalate first (`asdd slice escalate`).

### Project binding

`quality-gates.project.md` is a stub until Discovery. An unfilled test command, failure-log path, or `Active findings: unfilled` blocks the gate that needs it. The agent does not invent a substitute. Example finding rows are inactive. Set `Active findings: none` or replace them with this project's rows.

After a module copies a skill into `.agents/skills/`, regenerate the catalog with `asdd skills-index --write`. The installer does this. `asdd check` fails if the catalog drifts from the installed folders.

---

## Delivery pipeline

An idea becomes verified code through [Shape Up](https://basecamp.com/shapeup) and ASDD. There are no epics, user stories, story points, sprints, velocity, or backlog: work is a bet pitch, split into scopes, and each scope is one ASDD slice.

```text
Idea
  → 1. Shape Up          pitch: appetite, solution, rabbit holes, no-gos   (gate: human)
  → Betting table        bet for a cycle, or let it go (no backlog)
  → 2. Product Delivery  scope map → one intent.md per scope               (gates: human)
  → 3. ASDD + Harness    per intent: Discovery … Task Planning → Implementation → QA → Knowledge
  → End of cycle         ship verified scopes; hammer or cut the rest; cooldown
```

| Concern | Shape Up | ASDD | Harness |
|---|---|---|---|
| Select work | Pitch and betting decision | One intent per scope | Slice registry is the execution index |
| Control uncertainty | Appetite, boundaries, rabbit holes | Discovery, Validation, Domain, Design | Blocked state and evidence expose unresolved work |
| Define the solution | Rough solution and no-gos | Requirements, contracts, design, domain rules | Feature tracker records the executable projection |
| Control time and scope | Fixed appetite, variable scope | Must-have vs nice-to-have (~) outcomes | Tasks, dependencies, `scope_paths`, ownership |
| Demonstrate completion | Ship, or the circuit breaker | QA and Knowledge artifacts | Verification and evidence required for `passing` |

A pitch is a commitment, a scope is an independently finishable part of it, an ASDD slice is the specification source of truth for one scope, and a Harness feature is the current execution projection.

### 1. Shape Up

The `shape-up` skill turns an idea into a pitch. Terms follow Basecamp's [Shape Up](https://basecamp.com/shapeup): appetite, pitches, betting, cycles, scopes, hill charts, rabbit holes, cooldown, circuit breaker.

A pitch contains:

1. **Problem** — the specific friction, for whom, with evidence.
2. **Appetite** — the time the work is worth (small batch: one to two weeks; big batch: six weeks). A boundary, not an estimate.
3. **Solution** — the main elements, as a breadboard or fat-marker sketch; rough, solved, bounded.
4. **Rabbit holes** — risks found while shaping, each patched, cut, or flagged.
5. **No-gos** — what the work explicitly will not do.

Must-haves and nice-to-haves (~) separate what the bet needs from what can be cut.

**Betting.** The appetite and rabbit-hole gates pass (a human decision, recorded with `decided_by`). The betting table then decides for one cycle:

| State | Meaning | Next action |
|---|---|---|
| `needs_shaping` | Not concrete enough to bet on | Return to shaping |
| `ready_for_bet` | Shaped, gates passed | Betting table decides |
| `bet` | The team gets the whole cycle for this pitch | Product Delivery splits it into intents |
| `no_bet` | Not chosen this cycle | Let it go — no backlog; re-pitch later only if it still matters |

### 2. Product Delivery

The `product-delivery` skill splits a `bet` pitch into as many scopes as it needs and writes one intent per scope:

```text
Bet pitch → scope map (SCOPE-001 … SCOPE-N) → .harness/specs/<slice-id>/intent.md per scope → @asdd-discovery-agent
```

- A **scope** is a part that can be built, integrated, and shown working on its own, cut vertically through every layer it needs. A small pitch is one scope; a pitch with independent parts is several.
- The scope choice gate (a human decision) classifies each scope as `must_have`, `nice_to_have` (~), or `reshape` (out of this bet, back to shaping — never a backlog).
- Each intent carries the pitch and scope IDs, the bet's appetite, must-have outcomes written as EARS-style statements (checked against the EARS criteria by a human), nice-to-haves, no-gos, rabbit holes, and dependencies on other scopes.
- Intents go to `@asdd-discovery-agent` in dependency order; independent scopes can run in parallel.

Details: [`product-delivery/SKILL.md`](.agents/skills/product-delivery/SKILL.md) and the [handoff reference](.agents/skills/product-delivery/references/asdd-harness-handoff.md). A pitch or scope may also live in a tracker (GitHub Issues, Linear, Jira) through the `external-trackers` skill: a tracker cycle holds the bet, one issue per scope is optional, and the tracker is never the source of truth.

### 3. ASDD + Harness

| Source | ASDD + Harness destination |
|---|---|
| Problem and outcome (per scope) | `intent.md` and `capability.md` |
| Actors and domain language | Discovery and Domain artifacts |
| Must-have outcomes | MUST requirements, features in `.features.json` |
| Nice-to-haves (~) | SHOULD/COULD requirements, cut first when time runs short |
| Solution elements | Design input, subject to validation |
| Rabbit holes | Validation risks, spikes, or explicit blockers |
| No-gos | Out of scope and non-goals |
| Scope dependencies | Slice order; `tasks.md` waves inside a slice |

Discovery keeps the scope exactly as the intent defines it. An intent with more than one observable outcome goes back to Product Delivery (`SCOPE_SPLIT_REQUIRED`). If the problem, actor, outcome, appetite, or no-gos change, re-shape and re-bet.

**Task Planning** turns the approved design into tasks and the feature tracker. Every feature needs an observable behavior, a verification command, `scope_paths`, traceability (`req_ids`), and an owner when work runs in parallel. Tasks discovered later are fine inside the scope and appetite; a newly discovered scope gets its own intent; a new capability, actor, domain rule, external contract, or appetite change returns to shaping.

**Implementation** edits only mapped files. A feature becomes `passing` only with its verification result, `evidence`, and `asdd check` exiting 0 (`asdd sync` then records its `evidence_hash`). Numeric cutoffs live only in `.harness/steering/quality-gates.md`, and the full suite in `quality-gates.project.md` runs before a new spec enters Task Planning.

#### Lite-first and escalation

Lite slices use four artifacts (`spec.md`, `design.md`, `tasks.md`, the features file). Mode is derived from session events, never hand-edited ([`asdd-lite.md`](.harness/steering/asdd-lite.md)). Growth is detected, not judged:

| Trigger | Evidence | Effect |
|---|---|---|
| E1 scope spread | Scope spans ≥ 2 top-level modules | Signal; blocks `DONE` |
| E2 serial violation | > 1 `in_progress` feature | FAIL invariants (lite is serial) |
| E3 domain growth | > 1 new domain term on checkpoints | Signal; blocks `DONE` |
| E4 dissent | Any dissent session | Signal; blocks `DONE` |
| E5 implementation blockage | `phase_blocked` during implementation | Signal; blocks `DONE` |

Open signals are WARNs; completing `qa`/`knowledge` with signals open is a FAIL. Resolve with `asdd slice escalate <id> --reasons "E1-scope-spread,…"`, backfill `capability.md` and `requirements.md` from `spec.md`, and continue at Validation on the full path. Choose `full` upfront for new capabilities, cross-cutting or architectural work, or multiple domains.

#### Progress and cycle closure

Harness statuses say whether a feature started or passed. Shape Up adds a hill chart per scope — uphill while unknowns remain, downhill once the approach is settled — that never replaces feature status or evidence. At any point the team should know which scopes are still uphill, which must-haves are done, and what can be cut.

At the end of the cycle: ship the verified must-have scopes, cut unfinished nice-to-haves (scope hammering), or let the circuit breaker stop the bet. Never extend a cycle silently. Unfinished work is not carried over; if it still matters it is shaped and pitched again. The Knowledge phase records the outcome, decisions, cut scope, and reusable learning; cooldown covers fixes the team chooses, exploration, and shaping the next pitches.

#### Harness artifacts

| Artifact | Path |
|---|---|
| Active spec | `.harness/specs/<slice>/intent.md` (lite: `spec.md`) |
| Slice manifest (generated) | `.harness/state/slices/<id>/manifest.json` |
| Sessions (append-only) | `.harness/state/slices/<id>/sessions/*.json` |
| Feature tracker | `.harness/features/<id>.features.json` |
| Active slices index | `.harness/PROGRESS.md` |
| Gates and bindings | `.harness/steering/quality-gates.md`, `quality-gates.project.md` |
| Conflict rules | `.harness/steering/controls.md` |
| Audit reports and triage | `.harness/audits/` |
| Knowledge index (generated, never the source of truth) | `.harness/knowledge/` |

#### Traceability

```text
TASK → REQ → intent (slice) → scope → pitch
```

| Artifact | Traces to |
|---|---|
| Pitch | Raw idea, betting decision |
| Scope map | Pitch |
| `intent.md` (one per scope) | Scope, pitch |
| `capability.md`, `requirements.md` | Intent |
| `tasks.md`, features | `REQ-*` |
| Tracker issues (optional) | Pitch, scope |

---

## Jev MCP server (not installable)

TypeSafe **System One** (Jev) is **not part of the harness or the ASDD pipeline**. No `asdd` command, skill, agent, or hook calls it. The `shape-up` and `product-delivery` gates are decided by a human, with `decided_by` recorded.

Jev exists only as the [`jev-gate`](tools/jev-gate/README.md) MCP server in this repository. It gives people in chat a System One second opinion on those gates: `jev_status`, `jev_shape_up_gates`, `jev_scope_choice`, and `jev_ears_gate`.

- **Not installable.** `asdd install` installs nothing of it, `--modules=jev` is refused, and the npm package does not include `tools/jev-gate`.
- **To use it**, clone (or copy) this repository, build `tools/jev-gate`, and register it in your MCP client ([Get it](tools/jev-gate/README.md#get-it)).
- **Key.** `JEV_API_KEY` in the environment or the project's `.env` / `.env.local`; never commit it. `JEV_ENDPOINT` is optional. A missing key or an unavailable service is reported as a failure, never as a pass.
- **Upgrades.** Projects installed with the old `jev` module lose its files, `capabilities.jev`, `modules.jev`, and the `jev-gate` entry in `mcp.json` on the next `asdd install`.

---

## Spec drift and codebase audit

Steering instructions alone do not keep code and specs aligned: an agent can edit unmapped files, a `passing` feature's evidence goes stale when its files change, and nobody re-checks REQ → feature → test coverage. Three sensors close that gap. Usage by role: [`spec-drift.md`](.harness/steering/spec-drift.md).

| Sensor | Kind | Runs | Output |
|---|---|---|---|
| Spec drift check | Computational | Verify-on-Stop and CI, in seconds | FAIL/WARN lines in `check-invariants` |
| Codebase auditor | Computational, then inferential | On a schedule | `.harness/audits/<timestamp>.json` |
| `spec-drift` MCP server | Read-only view of both | On demand from chat | JSON, resources, prompts, optional dashboard |

All three share one library (`drift-lib.mjs`, `audit-lib.mjs` in `cli/src/harness/`, vendored into the server by `asdd kit vendor`), so the same logic runs in the stop hook, in CI, and from chat.

### Drift checks

| ID | When | Detects | Result |
|---|---|---|---|
| `DRIFT-01` | A slice is editing | A changed product file not covered by the slice's mapped files | FAIL |
| `DRIFT-02` | Always | A `passing` feature whose `scope_paths` files changed after its verification (`evidence_hash`) | FAIL; the feature returns to `in_progress` |
| `DRIFT-03` | Phase `qa` or later | A MUST requirement with no feature listing it in `req_ids` | FAIL |
| `DRIFT-04` | Phase `qa` or later | A requirement ID that no test file mentions | WARN |
| `DRIFT-05` | Always | A `passing` feature's `scope_paths` entry that does not exist (a glob passes when one file matches) | FAIL |
| `DRIFT-06` | Always | A feature without `scope_paths`, or `passing` without `evidence` | WARN; FAIL with `drift.contract: "fail"` in `project.json` |
| `DRIFT-07` | CI on a pull request | Product files changed, but the PR names no slice (branch `slice/<id>/…` or `Slice: <id>` in the body) | FAIL |

- **Mapped files** are the paths named in `intent.md`, `design.md`, `tasks.md`, or `spec.md`, the `scope_paths` of in-progress features, and test files (per the `Test file globs` binding) that name a REQ of the slice. Harness records and files the installer manages are exempt, so a kit upgrade is not drift.
- **`DRIFT-02`** recomputes the hash of the files `scope_paths` cover and compares it with `evidence_hash`, recorded by `asdd sync` when the feature became `passing`. No commit is needed, and it works without git.
- **`DRIFT-04`** matches requirement IDs as literal tokens (`REQ-001`) in test names or comments, so tagging tests with the REQ they verify is enforced.
- **Spec compliance** = MUST requirements with an implementing feature *and* a test mention, divided by all MUST requirements in scope. **Drift level** is `blocking` (any FAIL), `warning` (only WARNs), or `clean`. Any numeric cutoff belongs in `quality-gates.md` as an EARS rule — never in CI YAML, the server, or the dashboard.
- The check never judges whether code *satisfies* an EARS criterion; that is semantic and belongs to the auditor.

The gates (`QG-DRIFT-01…05` in `quality-gates.md`) require reverting or mapping an unmapped change before anything is marked `passing`, reopening a feature whose owned files changed, and blocking QA while a MUST requirement has no feature. The bindings live in `quality-gates.project.md`: `Test file globs`, `Drift base branch` (default `origin/HEAD`, then `main`), and `Audit commands`.

Every feature carries the contract the checks need:

```json
{
  "id": "F-02",
  "status": "passing",
  "req_ids": ["REQ-001"],
  "scope_paths": ["src/wallet/deposits.ts"],
  "verification": ["npm test -- deposits"],
  "evidence": "Tests passed: 12/12",
  "evidence_hash": "<sha256, written by asdd sync>"
}
```

### Codebase auditor

`asdd audit` looks at code no active slice is touching:

1. Runs the drift checks across **all** slices.
2. Lists **unowned code** — product files no feature owns (test files excluded).
3. Runs the project's `Audit commands` and architecture Gate command. An unfilled binding is reported as `unconfigured`, never as a pass.
4. Ranks hotspots by churn, requirement links, and findings, then writes `.harness/audits/<timestamp>.json`.

The inferential pass is the `codebase-audit` skill: for the top hotspots it traces each file to its requirements (`asdd knowledge trace file:<path>`), reads the EARS criteria and the code, and judges each `satisfied`, `violated`, or `unclear` with file and line evidence. `unclear` is never reported as `satisfied`.

- The auditor never edits code. A confirmed finding becomes a new slice or a task in the owning slice.
- Findings have stable IDs and occurrence counts. At three occurrences the finding becomes a [learning signal](#self-improving-harness): change the guide or sensor that let it through.
- Inferential findings are advisory until the Tech Lead confirms them.
- Dismissals live in `.harness/audits/triage.json` (finding ID, reason, who, when, and a hash of the files). Any change to that code brings the finding back. `asdd triage` records them; the MCP server never writes.
- The runner is the project's choice. An example GitHub Actions workflow installs to `.harness/examples/harness-audit.yml.example`; whichever runner is used must commit or upload `.harness/audits/`.

### MCP server `spec-drift`

The audit tools are a feature module of the `spec-drift` MCP server ([`tools/spec-drift/`](tools/spec-drift/README.md), NestJS), which also hosts Semgrep architecture analysis and GitHub PR review. It is separate from `knowledge`: knowledge is process memory, spec-drift is governance. Every audit tool is read-only, returns JSON text, and runs the checks of the asdd CLI (vendored into the server, so it needs no scripts at runtime) on the repo at `HARNESS_ROOT` (default: the working directory). The server lives only in this kit (`asdd install` does not copy `tools/`); build it once with `pnpm install && pnpm build` there (Node ≥ 24.22.1) when you want chat MCP. Projects use `asdd drift`, `asdd audit`, and `asdd check` instead.

| Tool | Does |
|---|---|
| `audit_diff` | Drift checks plus architecture rules on a diff. `mode: "review"` adds `DRIFT-07` and applies triage. Defaults: base from the `Drift base branch` binding, target `HEAD` plus the working tree |
| `verify_architecture_rules` | Loads `domain-layer.md`, the project bindings, `product.md`, `structure.md`, and `tech.md` (unfilled stubs are marked, not quoted). Uses `.semgrep.yml` (or the `Semgrep rules` binding), or generates a temporary config from a `Paths \| Must not import` table and the `Language` in `tech.md`, runs `semgrep scan --json`, and returns violations with fixes. Also runs the bound Gate command. A missing binary, command, or rules is not a pass |
| `verify_spec_compliance` | Per slice: the core `ears` adapter (`DRIFT-03`/`04`) plus module adapters such as `openapi` from `http-api` |
| `generate_ci_gate` | CI config text (GitHub or GitLab) that runs `asdd check`; it writes no files and carries no threshold |
| `audit_report` / `audit_finding` | Latest audit, filtered; one finding with its REQ → feature → file trace |

Resources: `spec://manifest`, `spec://rules/architecture`, `spec://drift/latest-report`, and `ui://spec-drift/audit-dashboard.html`. Prompts are thin pointers to skills and steering: `architecture-review`, `spec-alignment` (per-REQ `satisfied` / `violated` / `unclear`), and `pr-review` (draft comments ordered 🔴 FAIL, 🟡 WARN, 🔵 advisory — never posted by the server).

**Dashboard.** On hosts that render MCP Apps, the tools show a single-file HTML view built from `tools/spec-drift/ui/audit-dashboard/`; others get the same JSON. Actions only post messages to the conversation: *Trace* (both modes), *Send to agent as task* (author), *Draft comment* and *Dismiss…* (review). Results for the view stay under 8 KB (Cursor stops mounting the view above about 13 KB); larger results are always paged with `page_token` and `offset`, and architecture source texts load on demand (`include_text`, `source`). Cursor renders widgets only from servers registered globally with `HARNESS_ROOT` ([`.agents/mcp/README.md`](.agents/mcp/README.md)).

### Team roles

| | Engineers | Tech Lead |
|---|---|---|
| Main loop | The ASDD pipeline per slice, lite by default | Pull request review and a weekly codebase health check |
| Uses | The full harness and Verify-on-Stop | `pr-review`, `audit_diff` in review mode, `verify_spec_compliance`, `audit_report` |
| Owns | Their slices' specs, features, `scope_paths`, and evidence | Bindings, ADR exceptions, Design sign-off, escalation calls, triage |
| Writes | Product code in mapped files | Review comments, `triage.json`, bindings — no product code during review |

1. The engineer passes Verify-on-Stop and opens a PR linked to the slice.
2. CI runs `asdd check`. A red PR goes back without review, so the Tech Lead's time goes to what machines cannot judge.
3. The Tech Lead runs `pr-review`, then confirms each advisory finding (it becomes a task in the engineer's slice) or dismisses it with a reason.
4. The Tech Lead posts the review with their own tooling; the server has no GitHub token.
5. The engineer fixes it in a normal session.

Engineers work in separate slices, or in one slice with disjoint `scope_paths`. A check that is dismissed repeatedly is producing false positives — tune or remove it. Make the Tech Lead code owner of the gate files, bindings, `controls.md`, and hook config so an agent cannot loosen them without review (example: `.harness/examples/CODEOWNERS.harness.example`).

---

## Self-improving harness

Sensors catch a failure once. The learning loop catches the *same* failure coming back, and changes the guide or sensor that let it through — then checks that the change worked. Every step is deterministic except writing the proposal, and humans decide every change.

```text
signals ──► asdd learn ──► LP-* pattern ──► SP-* proposal ──► Tech Lead ──► applied
   ▲                                                                       │
   └──────────── recurrence after the change → ineffective, pattern reopens ┘
                 10 quiet sessions in its area → verified
```

**Signals** are read where they already live; recorded invariants runs and command-gate denials are the only new writers. A `passing` feature reopened by `DRIFT-02` shows up as `sensor:DRIFT-02:<area>`.

| Source | Signature | Kind |
|---|---|---|
| Failing `asdd check --live` or `--record` run — Verify-on-Stop, an agent on a runtime without hooks, or CI | check code + area, e.g. `sensor:DRIFT-01:docs`; runs within 30 min count once | escape |
| A WARN from a recorded run, counted by distinct days (opens at 5 days) | `warn:<check>:<area>` | noise |
| Command denied by the command gate (pattern label only, never the command text) | `command:git push --force` | escape |
| Agent failure log entry with a `**Signature:**` line (`QG-DEB-05`) | `failure:<signature>` | escape |
| Session `phase_blocked` / `feature_blocked` | `blocked:phase:design`, `blocked:feature:<area>` | escape |
| Session `dissent` | `dissent:<phase>` | escape |
| Lite escalation signal, once per slice | `escalation:E1-scope-spread` | escape |
| Recurring audit finding | `audit:<AUD-id>` | escape |
| Session `override` of a gate | `override:<phase>` | noise |
| Tech Lead dismissal in `triage.json` | `dismissed:<check>` | noise |

An **escape** means a guide or sensor let a failure through; **noise** means a sensor fires without catching a defect, which is what teaches a team to ignore a harness. Noise proposals loosen, tune, or remove the sensor.

**Storage.** A failing run writes a raw file to `.harness/state/learning/signals/` (gitignored). Every `asdd learn` run — so every `asdd sync` — folds those into `.harness/state/learning/summaries/<ISO-week>-<author>.json`, which is committed. Only that author writes that file, so summaries never conflict in git and the team shares one count. The author is `HARNESS_AUTHOR`, else your git user name. Pull-request CI records and prints patterns but cannot persist them; the scheduled audit workflow (`.harness/examples/harness-audit.yml.example`) records failures on the default branch as author `ci` and commits them.

**Patterns.** `asdd learn` (also run by every `asdd sync`) groups signals by signature into `LP-*` patterns in `.harness/state/learning/patterns.json` (generated). A pattern is `open` at three occurrences.

**Proposals.** `asdd learn --propose <LP-id>` scaffolds `docs/knowledge-base/steering-proposals/SP-NNN.md` from the template. Its frontmatter is the contract:

```yaml
id: SP-004
pattern: LP-a9dc05fe
status: proposed            # proposed → accepted | rejected → applied (TL only)
control: .harness/steering/asdd-lite.md
change: tighten-guide       # add-guide | tighten-guide | add-sensor | tighten-sensor | loosen-sensor | remove-sensor | product-code
success: no escalation:E1-scope-spread in the next 10 sessions
decided_by: tl
applied_commit: 3f2c1ab     # must change the control file (checked with git)
```

`rejected` is a recorded "won't fix" and closes the pattern. A pattern about an area (`sensor:DRIFT-01:docs`) is verified only by sessions whose `scope_paths` touch that area. To keep failure-log repeats countable, reuse an existing signature: `asdd learn --signatures` (or `failure_signatures` in `knowledge_patterns`). `product-code` proposals are implemented by the Refactor agent as Self-Healing PRs.

**Gate** (`validators/learning.mjs`, inside `asdd check`):

| Rule | Result |
|---|---|
| A pattern is `open` with no proposal, or its applied proposal is `ineffective` | WARN |
| A proposal is malformed (unknown pattern, missing control file, unfilled success, decided without `decided_by`, applied without `applied_commit`) | FAIL |
| `applied_commit` is not a commit, or does not change the `control` file | FAIL |
| A slice completes Knowledge while a pattern it contributed to is `open` | FAIL |

**In review.** `audit_diff` returns a `learning` block — open patterns, marked `relevant` when they are about a changed area or a linked slice — and the `pr-review` prompt turns relevant ones into advisory comments. It never blocks a PR.

**Back to the kit.** `asdd learn --export --out lessons.md` writes the verified and ineffective proposals on kit-owned controls, with generic fields only (no examples, slice names, proposal text, or commands), and prints the `gh issue create` command to send it to the kit. Nothing is sent automatically.

Rules: `QG-LEARN-01`…`09` in [`quality-gates.md`](.harness/steering/quality-gates.md). See open patterns with `asdd status`, `asdd learn`, `asdd knowledge patterns`, or the `knowledge_patterns` MCP tool.

---

## Principles

| Principle | Meaning |
|---|---|
| Fixed time, variable scope | Appetite is a boundary, not an estimate |
| Lite-first, escalate on evidence | Ceremony is earned from session evidence, not presumed |
| Ambiguity is a defect | Clarify, label assumptions, or mark `PENDING_DEFINITION` |
| Contracts over assumptions | Every stage consumes and produces explicit artifacts |
| AI is a pilot, not an authority | Humans keep approval authority |
| Evidence before completion | `passing` needs a recorded verification result; a summary is not evidence |
| Invariants before handoff | `asdd check` exits 0; the same failure three times changes the guide or sensor that missed it |
| Mapped files only | Product edits stay inside the active spec; no unrequested refactors |
| One numeric gate | Cutoffs live only in `quality-gates.md` |
| Traceability and stable identity | Every pitch, scope, intent, REQ, and task has an ID, and downstream artifacts link upstream |
| Unconfigured is not a pass | A missing tool, binding, or key is reported, never counted as success |

---

## What's inside

**Agents** (`.agents/agents/`) — Discovery, Spec, Validation, Domain, Design, Task Planning, Implementation, QA, Knowledge, Refactor, Lite, and Spike Researcher. Runtime-agnostic markdown; one role per agent.

#### Agents and their tool envelopes

Each agent declares a tier and what it may do in its frontmatter (`metadata.tier`, `capabilities`, `limits.max_turns`), and its body follows one grammar: when to use it and when not, a role charter (guarantees, operational and quarantine boundaries, decision rights), ground truth in tiers, a typed delegation contract with a verdict, negative space, a convergence gate with a negative check, and an escalation gate.

| Tier | Agents | Tool envelope |
|---|---|---|
| orchestrator | Implementation | Edits through context-fresh sub-agents; the only agent that spawns sub-agents |
| specialist | Discovery, Spec, Domain, Design, Task Planning, Refactor, Knowledge, Lite, Integration Tester, E2E Tester | Writes only its own artifacts (`write_paths`) |
| auditor | Validation, QA | Writes only its report; never edits what it audits. QA judges coverage; tests come from Implementation's TDD step |
| researcher | Spike Researcher | Read-only; returns a cited findings table when an agent reports low confidence |

`asdd install` renders these envelopes for the runtimes that support them:

| Runtime | Rendered from `capabilities` |
|---|---|
| Claude Code (`.claude/agents/`) | `tools` allowlist (auditors without `Edit`; `Agent` only for the orchestrator), or `disallowedTools` for agents that need MCP tools; `maxTurns` |
| Cursor (`.cursor/agents/`) | `readonly: true` for agents that write nothing |
| OpenCode (`.opencode/agents/`) | `permissions`: edits denied outside `write_paths`, sub-agents denied except for the orchestrator; `steps` |
| Kimi, Junie, Devin, Kiro | A link to `.agents/agents/` (no per-agent tool field) |

Claude Code has no per-path write rule, so an auditor there keeps `Write` and `Bash`; its negative mutation check and `DRIFT-01` cover the rest. Details: [`cli/agents/_runtime-template.md`](cli/agents/_runtime-template.md).

**Skills** (`.agents/skills/`) — Shape Up, Product Delivery, External Trackers, Capability Discovery, Domain-Language Extraction, Test-Driven Development, Documentation & ADRs, Anti-Pattern Detection, Codebase Audit, Codegraph, Business Model Canvas, and Create MCP App. Agents see names and descriptions ([`skills.md`](.harness/steering/skills.md)) and read a skill's body only when the task starts. Every skill is a runbook: trigger and negative boundary, an input/output contract, steps with an action, target, and assertion, a verification gate, an escalation gate, and its handoffs; general advice lives in its `references/`.

**Steering** (`.harness/steering/`)

| File | Purpose |
|---|---|
| `product.md`, `structure.md`, `tech.md`, `design-system.md` | Project bindings: product, layout, stack, UI |
| `domain-layer.md` / `.project.md` | Domain boundaries and ubiquitous language |
| `quality-gates.md` / `.project.md` | EARS gates; test commands, drift and audit bindings |
| `session-loop.md`, `manifest.md` | Session open/close, file scope, evidence; the phase machine |
| `asdd-lite.md` | Lite mode and escalation |
| `spec-drift.md`, `knowledge.md` | Drift sensors, knowledge index (code intelligence: the `codegraph` skill) |
| `controls.md` | Which guide or sensor wins on a conflict |
| `security-rules.md`, `skills.md` | Security rules, skills index  |
| `templates/` | Artifact templates for every phase |

**CLI** (`cli/`) — the `asdd` command and the harness itself: sources in `cli/src/`, compiled to `cli/dist/`, plus everything the installer ships (agents, skills, steering, scaffold, templates, modules, runtimes, MCP config). See [`cli/README.md`](cli/README.md).

**Harness** (`.harness/` in a project) — `config/`, `steering/`, `state/`, `specs/`, `features/`, `audits/`, `knowledge/` (generated), and `PROGRESS.md`. No npm packages are installed there, and no copy of the CLI (asdd is the `asdd-harness-kit` package).

**MCP servers** (`tools/`, NestJS; never installed into projects, which get an empty `.agents/mcp/mcp.json`) — `knowledge` and `spec-drift` (also in the npm package), and `jev-gate` (only in a clone of this repository). Agents and skills do not depend on these servers: they run the same logic through the `asdd` CLI (`asdd knowledge`, `asdd drift`, `asdd audit`). Codegraph is a skill (`.agents/skills/codegraph`) on the codegraph CLI, not an MCP server.

**Modules** (`cli/modules/`, part of the CLI; opt-in) — `bruno` (integration testing agent + `bruno-api-testing` skill), `playwright-e2e` (end-to-end testing agent + `playwright-e2e-testing` skill), `web-ui` (UI skills), and `http-api` (API design skills and the `openapi` compliance adapter).

**Runtime recipes** (`cli/runtimes/`) — Cursor, Claude Code, OpenCode, Kimi Code, Junie, Devin, and Kiro. The installer wires agents, skills, and MCP into each runtime; the recipes themselves stay in this kit.

---

## Requirements

- **Node.js 22+** for the `asdd` CLI (22.5+ for the SQLite knowledge index; older versions fall back to JSONL)
- **The `asdd-harness-kit` package** in each project (`npm i -D`) or globally (`npm i -g`): hooks, agents, and CI run it; `asdd doctor` fails while neither is installed
- **A POSIX shell** for the Cursor and Claude Code hooks (macOS, Linux, WSL, or Git Bash)
- **git** — drift checks, installer `--from-git` and `--pr` (plus a signed-in `gh` for `--pr`)
- **Node.js 24.22+ and pnpm** — only to build and run the MCP servers in `tools/`
- **`JEV_API_KEY`** — only for the `jev-gate` MCP server, in a clone of this repository
- **semgrep** — optional for architecture scans (`asdd audit`, `verify_architecture_rules`); `asdd doctor` checks it (fail when `capabilities.semgrep.required`)
- **[codegraph](https://www.npmjs.com/package/codegraph)** — recommended (`npm i -g codegraph`, then `codegraph init`): agents use it through the `codegraph` skill (the CLI, no MCP server); `asdd doctor` checks it

---

## Documentation

| Document | Covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Operational map — read every session |
| [`cli/README.md`](cli/README.md) | The `asdd` CLI: commands, install ownership and safety, layout |
| [`cli/runtimes/README.md`](cli/runtimes/README.md) | Per-runtime wiring |
| [`.harness/steering/README.md`](.harness/steering/README.md) | Steering files and how agents load them |
| [`tools/knowledge`](tools/knowledge/README.md), [`tools/spec-drift`](tools/spec-drift/README.md), [`tools/jev-gate`](tools/jev-gate/README.md) | The MCP servers |

---

## Developing the kit

The kit is developed with the kit: every change goes through a slice in this repository, and `asdd check` must pass before a commit.

- **Running the CLI.** The kit has no `.harness/cli`: run `node cli/bin/asdd.mjs <command>` (its hooks, CI, and `project.json` commands do).
- **Edit sources, not copies.** Steering, scaffold, agents, skills, and harness code live in `cli/`. After a change: `npm run build` (`cli/dist`), `asdd kit vendor` (when a server's vendored library changed), `asdd kit self` (the kit's own `.harness/`, `.agents/`, `AGENTS.md`), and `asdd kit versions` (when the shipped artifacts changed). `npm test` fails while any of them is stale.
- **Skills and agents.** A new or changed skill or agent follows the grammar `asdd kit skills-lint` and `asdd kit agents-lint` check (both run in `npm test`). A core skill or agent names only core skills and agents; module ones may name core ones and their own module's. Long runbooks go to a skill's `references/`, not into an agent.
- **Mode.** Use `asdd slice init <id> --full`. Almost every kit change touches `cli/`, `.harness/`, and `.agents/`, so a lite slice would raise E1 on its first feature (see `docs/knowledge-base/steering-proposals/SP-001.md`).
- **Bindings.** `.harness/steering/{product,structure,tech,domain-layer.project,quality-gates.project,design-system}.md` describe the kit itself. The stubs that projects receive live in `cli/templates/bindings/`.
- **Kit-only artifacts.** This repo's slices, specs, features, sessions, archive, learning state, audits, `project.json`, bindings, and steering proposals are never installed into a project and never published to npm (`files` negations in `package.json`). `cli/test/install.sh` fails if one leaks.
- **Closed work.** A slice that will not reach DONE is moved to `.harness/state/archive/<id>/` with a `<id>.json` record; the learning loop still reads its sessions.

---

## License

MIT — see [LICENSE](LICENSE).
