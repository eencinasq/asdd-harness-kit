# asdd-harness-kit

A portable process layer for **Agent Specification-Driven Development (ASDD)** and **Harness Engineering**.

It gives AI agents a governed pipeline — from shaping an idea through implementation, QA, and knowledge capture — with feature trackers, file-scope enforcement, verification evidence, spec-drift sensors, and traceability. You bring your own stack (Python, Go, Rails, Next.js, Nest, …). The kit brings the process.

**Contents:** [What this is](#what-this-is) · [Install](#install) · [How a session works](#how-a-session-works) · [Delivery pipeline](#delivery-pipeline) · [Jev module](#jev-module-optional) · [Spec drift and codebase audit](#spec-drift-and-codebase-audit) · [Self-improving harness](#self-improving-harness) · [Principles](#principles) · [What's inside](#whats-inside) · [Requirements](#requirements) · [Documentation](#documentation) · [Developing the kit](#developing-the-kit)

---

## What this is

| Concern | What the kit provides | What you provide |
|---|---|---|
| **Process** | 9-phase ASDD pipeline, agent definitions, skills catalog, steering contracts | Product intent, domain language, technology choices |
| **Execution control** | Append-only sessions, feature trackers, generated manifests, invariant checks | Mapped file scopes, verification commands |
| **Quality gates** | EARS templates, Harness invariants, shaping and delivery gates (human-decided, or Jev with the optional module) | Test suites, failure logs, `JEV_API_KEY` only with the Jev modulering |
| **Spec drift and audit** | Drift checks in the invariants and CI, codebase auditor, `spec-drift-auditor` MCP server with a dashboard | Architecture gate command, audit commands, OpenAPI contract (optional bindings) |
| **Knowledge** | Generated index of specs, requirements, features, and sessions, queried through the `knowledge` MCP server | Optional embeddings endpoint |
| **Runtime adapters** | Configs and symlinks for Cursor, Claude Code, OpenCode, Kimi, Junie, Devin, Kiro | Your IDE or agent runtime |

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

**Slices are Lite-first.** Every slice starts in `lite` mode (`Spec → Design → Tasks → Implementation → QA-Lite`). `full` is opt-in (`init-slice.mjs --full`) for work known upfront to be cross-cutting or architectural. Growth in a lite slice is detected from session evidence and **blocks completion until the slice is escalated** ([escalation](#lite-first-and-escalation)).

---

## Install

### Add to an existing project (recommended)

```bash
# Interactive wizard (prompts for target, runtimes, modules)
npx asdd-harness-kit

# Non-interactive
npx asdd-harness-kit /path/to/repo --modules=http-api,web-ui --runtime=cursor

# Several runtimes in one pass
npx asdd-harness-kit /path/to/repo --runtime=opencode,kimi,junie,devin,kiro

# From GitHub when the package is not on npm
npx github:eencinasq/asdd-harness-kit /path/to/repo --runtime=cursor

# From a local clone of this kit
./scripts/install-into.sh /path/to/repo --modules=http-api,web-ui --runtime=cursor

# One-liner (clones the kit temporarily)
curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
  | bash -s -- /path/to/repo --from-git --modules=http-api --runtime=cursor
```

| Flag | Effect |
|------|--------|
| `-i, --interactive` / `--no-interactive` | Prompt for target, runtimes, modules (default in a TTY) / never prompt |
| `--modules=…` | `bruno`, `playwright-e2e`, `web-ui`, `http-api`, or `all` |
| `--runtime=…` | `cursor`, `claude`, `opencode`, `kimi`, `junie`, `devin`, `kiro` |
| `--force` | Refresh every kit-owned file, ignoring versions |
| `--force-bindings` | Overwrite project binding files (**dangerous**) |
| `--force-mcp` | Replace `.agents/mcp/mcp.json` with the kit baseline |
| `--skip-bindings` / `--skip-docs` / `--skip-deps` | Skip binding stubs / `AGENTS.md` and docs / the `sqlite-vec` install |
| `--dry-run` | Preview actions without applying them |

**Safe by default.** Project-owned files — bindings, `AGENTS.md`, slice state, specs, logs, and `mcp.json` — are created once and never overwritten. Kit tests and the kit's design notes stay in this repository.

### How the kit maps to a product repo

| Layer | Where |
|-------|-------|
| **A. Kit core** | This repository |
| **B. Modules** | Optional modules stay in the kit and are copied only when enabled |
| **C. Bindings** | `.harness/steering/{product,structure,tech,*.project}.md` stubs |
| **D. Runtimes** | Runtime adapters maintained in this kit under `runtimes/` |

Do not copy from another product monorepo: specs, `PROGRESS.md` history, filled `product`/`structure`/`tech` bindings, or stack-specific boundary scripts.

### Adopter checklist

1. Install the kit (above) or use it as a template (below).
2. Fill all required bindings.
3. Install the runtime links you use with `--runtime=…`. Runtime recipes stay in this kit and are not copied into product repos.
4. Enable modules with `--modules=<list>`, from a local clone or with the `--from-git` form.
5. Validate the generated adapter: `node .harness/scripts/check-project-config.mjs`.
6. Validate Harness state: `node .harness/scripts/check-invariants.mjs`. This also checks that `.harness/steering/skills.md` lists only the name and description of each folder under `.agents/skills/`.
7. Fill `quality-gates.project.md` before Discovery: the full-suite command, the failure-log path, and `Active findings` (`none` or real rows). A stub blocks the gate that needs it.
8. With `--runtime=cursor`, confirm `.cursor/hooks.json` runs `node .harness/scripts/verify-on-stop.mjs` on `stop` and `node .harness/scripts/command-gate.mjs` on `beforeShellExecution`. With `--runtime=claude`, confirm `.claude/settings.json` registers the same two scripts on `Stop` and `PreToolUse` (Bash).
9. Only with `--modules=jev`: set `JEV_API_KEY`, keep `capabilities.jev.apiKey` empty, prefer the `jev-gate` MCP server (`jev_status`), shell fallback `node .harness/scripts/jev-gates.mjs health`. Confirm `required: false` and `required_by: ["shape-up","product-delivery"]` ([Jev module](#jev-module-optional)).
10. Optional spec drift and audit bindings in `quality-gates.project.md` (`Test file globs`, `Drift base branch`, `Audit commands`, `Contract command`, `OpenAPI spec`) and the `Gate command` in `domain-layer.project.md`. Unfilled ones report `unconfigured`. Keep `drift.contract: "warn"` in `project.json` until every feature has `scope_paths` and `passing` features have `evidence_commit`, then set `"fail"` ([spec drift](#spec-drift-and-codebase-audit)).
11. Create the first slice via Discovery or ASDD-Lite.

The knowledge index (spec/session/feature graph + searchable chunks) regenerates at the end of every `sync-state.mjs` run, or manually with `node .harness/scripts/sync-knowledge.mjs`. The `knowledge` MCP server is already registered in `.agents/mcp/mcp.json`; the index lives under `.harness/knowledge/` (generated — keep it gitignored).

### Updates and versions

The kit has **one version**: `package.json`. Every artifact the installer copies carries that version in `.harness/config/versions.json`, and the target records what it received in `.harness/config/installed-versions.json`. Re-running the installer refreshes every kit-owned file whose version changed, so a release reaches every file — nothing stays stale because one file was not bumped.

```bash
node scripts/generate-versions.mjs bump 3.7.0   # set package.json + lock, restamp every artifact
node scripts/generate-versions.mjs              # restamp at the current version
```

Then re-run the installer in dependent projects. `npm test` fails when an artifact's version differs from the project version, or when the installer refreshes a file that has no version entry.

### Use as a template for a new project

```bash
git clone https://github.com/eencinasq/asdd-harness-kit.git my-project && cd my-project

# 1. Fill the project bindings (stubs are not product truth)
$EDITOR .harness/steering/{product,structure,tech,domain-layer.project,quality-gates.project}.md

# 2. Verify
node .harness/scripts/check-project-config.mjs
node .harness/scripts/check-invariants.mjs

# 3. First slice (lite by default; --full for cross-cutting work), then write its spec
node .harness/scripts/init-slice.mjs my-first-slice
node .harness/scripts/harness-status.mjs
```

### Kit tests

- `npm test` — installer smoke test (all runtimes and modules), lifecycle e2e (slice state machine with negative invariant cases), and unit tests for drift, audit, Semgrep, knowledge, the learning loop, Jev, and the MCP servers.
- `npm run test:full-flow` — Shape Up → Product Delivery → lite slice → evidence → escalation → DONE → Verify-on-Stop. With `JEV_API_KEY` set, the Jev gates run live; without it those stages are skipped (Harness stages still run).

---

## How a session works

Read [`AGENTS.md`](AGENTS.md) every session. The loop:

1. **Read** `.harness/state/registry.json` (squad state) and the target slice's `manifest.json` (mode, phase, escalation signals).
2. **Read steering** for the current phase (`inclusion: always` files, plus `auto` files whose tags match).
3. **Pick work** — dependency-ready features; lite slices are serial (one `in_progress`).
4. **Edit only mapped files** — the paths named by the active spec, plus the feature's `scope_paths`.
5. **Write a session file** — an append-only log of every significant action — then run `sync-state.mjs`.
6. **Verify before close** — `node .harness/scripts/check-invariants.mjs` must exit 0.
7. **Record evidence** — no feature is `passing` without its verification result, `evidence`, and `evidence_commit`.
8. **Escalate when evidence demands it** — open signals on a lite slice block `DONE` until `escalate-slice.mjs` acknowledges them.

On **Cursor**, `.cursor/hooks.json` runs the command gate on `beforeShellExecution` (fail-closed) and `verify-on-stop.mjs` on `stop`. On **Claude Code**, `.claude/settings.json` wires the same scripts to `PreToolUse` (Bash) and `Stop`. Both stop gates run `check-invariants.mjs --live`, and a failure comes back as the next prompt. Other runtimes are advisory and rely on CI:

| Runtime | Command gate (pattern) | Verify-on-stop |
|---------|------------------------|----------------|
| Cursor | `beforeShellExecution` hook (fail-closed) | `stop` hook (fail-closed) |
| Claude Code | `PreToolUse`/`Bash` hook | `Stop` hook (loop-safe) |
| OpenCode, Kimi, Junie, Devin, Kiro | Advisory — run `node .harness/scripts/command-gate.mjs` before dangerous commands, or expose the `check_command_safety` MCP tool (no System One) | Run `node .harness/scripts/check-invariants.mjs --live` before marking `passing` (no `JEV_API_KEY` required); a failing run is recorded as a learning signal |

| Command | Purpose |
|---|---|
| `harness-status.mjs` | Active slices, modes, features in progress, escalation signals |
| `init-slice.mjs <id> [--full]` | Scaffold a slice (lite by default) |
| `escalate-slice.mjs <id> --reasons "<triggers>"` | Lite → escalated |
| `sync-state.mjs [--slice <id>]` | Regenerate manifests, registry, and the knowledge index from session logs |
| `check-invariants.mjs [--live]` | Harness invariants, including spec drift (no Jev; `--live` is used by Verify-on-Stop) |
| `check-spec-drift.mjs [--json]` | The drift checks on their own |
| `audit-codebase.mjs` | Whole-codebase audit report |
| `sync-knowledge.mjs [--embed]` | Rebuild the knowledge index |
| `learn.mjs [--all \| --signatures \| --export \| --propose <LP-id>]` | Learning patterns; signatures in use; lessons for the kit; scaffold a steering proposal |

All commands live in `.harness/scripts/` and run with `node`.

### Guides, then sensors

A guide steers the agent before it edits. A sensor checks the result and, on failure, comes back as the next prompt so the agent can correct it before the session ends. The index, the regulation each control owns, and the precedence order are in [`.harness/steering/controls.md`](.harness/steering/controls.md).

| When | What runs | Contract |
|------|-----------|----------|
| Session start | Read `PROGRESS.md`, the slice manifest, features, and the steering for the phase, including `controls.md` | `AGENTS.md` |
| Before choosing a skill | The skills index exposes only each folder's name and description | `.harness/steering/skills.md` |
| When that task starts | Read `.agents/skills/<name>/SKILL.md`. Do not read `references/` until that body says to | `skills.md` |
| Before any product edit | Stay inside the files mapped to the active spec. Do not refactor unless the spec, the current task, or the slice phase `refactor` asks for it | `.harness/steering/session-loop.md` |
| At a full-ASDD phase gate | Apply EARS / coverage criteria in `quality-gates.md`. Lite skips those numeric gates | `.harness/steering/quality-gates.md` |
| Before a Shape Up bet or writing intents | Shaping and delivery gates: a human decision (`decided_by`), or the `jev-gate` MCP with the Jev module | `.harness/steering/jev.md` |
| Dangerous bash | `command-gate.mjs` pattern allow/deny (no Jev) — hook-wired on Cursor and Claude Code, both fail-closed; advisory elsewhere | `.harness/scripts/command-gate.mjs` |
| In-progress diff vs spec | Deterministic scope mapping (`session-loop.md` + `features.mjs`) | `.harness/steering/session-loop.md` |
| Lite slice governance | Serial rule (one `in_progress`, FAIL) + escalation signals block `DONE` while open (`validators/lite-escalation.mjs`, `sync-state.mjs`) | `.harness/steering/asdd-lite.md` |
| Before `passing` or session end | `node .harness/scripts/check-invariants.mjs` must exit 0. WARN does not block. FAIL does | `session-loop.md` |
| Session end gate | Cursor stop hook and Claude Code Stop hook run `verify-on-stop.mjs` → `check-invariants.mjs --live` (does **not** require `JEV_API_KEY`); a failing check is returned as the next prompt (Cursor `loop_limit` 3; Claude respects `stop_hook_active`). Abort and error statuses do not continue the loop | `.cursor/hooks.json`, `.claude/settings.json` |
| Before `passing` (engineers) and PR review (Tech Lead) | Spec drift `DRIFT-01`…`07` runs inside the invariants; `audit_diff` on the `spec-drift-auditor` MCP server gives the same findings in chat, in `author` or `review` mode | `.harness/steering/spec-drift.md` |
| Pull request | `.github/workflows/harness-invariants.yml` runs unit tests, installer smoke, lifecycle e2e with negative cases, config/skills checks, and `sync-state` + invariants (with the PR branch and body for `DRIFT-07`) | CI |
| On a schedule | `audit-codebase.mjs` (drift over all slices, unowned code, audit commands, hotspots) and the `codebase-audit` skill; the Tech Lead triages | `.harness/audits/` |
| Before a new spec enters Task Planning | The full-suite command in `quality-gates.project.md` must report zero failures | `QG-DEB-*` |
| Same failure, override, or dismissal three times | `learn.mjs` opens a pattern; a steering proposal names the guide or sensor to change. WARN while open, FAIL when the slice closes Knowledge | `QG-DEB-06`, `QG-LEARN-*` |

Fast checks stay at session stop. The more expensive suite stays on the Task Planning gate. CI repeats the invariants check after integration.

### What "done" means

A feature is `passing` only when its `verification` command has been run and the `evidence` field records that result, and the sensors for the session exit 0. A written summary is not evidence.

Session close:

1. Invariants exit 0 in live mode (structural harness checks; Jev is not part of this gate).
2. No feature is `passing` without evidence.
3. The diff contains only mapped product files and the harness records the session loop allows (sessions, features, `PROGRESS.md` row).
4. The `PROGRESS.md` row matches the per-slice manifest.
5. Lite slices closing with open escalation signals are rejected — escalate first (`escalate-slice.mjs`).

### Project binding

`quality-gates.project.md` is a stub until Discovery. An unfilled test command, failure-log path, or `Active findings: unfilled` blocks the gate that needs it. The agent does not invent a substitute. Example finding rows are inactive. Set `Active findings: none` or replace them with this project's rows.

After a module copies a skill into `.agents/skills/`, regenerate the catalog with `node .harness/scripts/check-skills-index.mjs --write`. The installer does this. `check-invariants.mjs` fails if the catalog drifts from the installed folders.

---

## Delivery pipeline

An idea becomes verified code through [Shape Up](https://basecamp.com/shapeup) and ASDD. There are no epics, user stories, story points, sprints, velocity, or backlog: work is a bet pitch, split into scopes, and each scope is one ASDD slice.

```text
Idea
  → 1. Shape Up          pitch: appetite, solution, rabbit holes, no-gos   (gate: human, or Jev module)
  → Betting table        bet for a cycle, or let it go (no backlog)
  → 2. Product Delivery  scope map → one intent.md per scope               (gates: human, or Jev module)
  → 3. ASDD + Harness    per intent: Discovery … Task Planning → Implementation → QA → Knowledge   (no Jev)
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

**Betting.** The appetite and rabbit-hole gates pass (a human decision, or `jev_shape_up_gates` with the Jev module, where `unavailable` stops the bet). The betting table then decides for one cycle:

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
- The scope choice gate (human, or `jev_scope_choice` with the Jev module) classifies each scope as `must_have`, `nice_to_have` (~), or `reshape` (out of this bet, back to shaping — never a backlog).
- Each intent carries the pitch and scope IDs, the bet's appetite, must-have outcomes written as EARS-style statements (checked by the EARS gate — human, or `jev_ears_gate` with the Jev module, or `# jev-override: accept`), nice-to-haves, no-gos, rabbit holes, and dependencies on other scopes.
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

**Implementation** edits only mapped files. A feature becomes `passing` only with its verification result, `evidence`, `evidence_commit`, and `check-invariants.mjs` exiting 0. Numeric cutoffs live only in `.harness/steering/quality-gates.md`, and the full suite in `quality-gates.project.md` runs before a new spec enters Task Planning.

#### Lite-first and escalation

Lite slices use four artifacts (`spec.md`, `design.md`, `tasks.md`, the features file). Mode is derived from session events, never hand-edited ([`asdd-lite.md`](.harness/steering/asdd-lite.md)). Growth is detected, not judged:

| Trigger | Evidence | Effect |
|---|---|---|
| E1 scope spread | Scope spans ≥ 2 top-level modules | Signal; blocks `DONE` |
| E2 serial violation | > 1 `in_progress` feature | FAIL invariants (lite is serial) |
| E3 domain growth | > 1 new domain term on checkpoints | Signal; blocks `DONE` |
| E4 dissent | Any dissent session | Signal; blocks `DONE` |
| E5 implementation blockage | `phase_blocked` during implementation | Signal; blocks `DONE` |

Open signals are WARNs; completing `qa`/`knowledge` with signals open is a FAIL. Resolve with `escalate-slice.mjs <id> --reasons "E1-scope-spread,…"`, backfill `capability.md` and `requirements.md` from `spec.md`, and continue at Validation on the full path. Choose `full` upfront for new capabilities, cross-cutting or architectural work, or multiple domains.

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

## Jev module (optional)

TypeSafe **System One** (Jev) is an optional module. Without it, the kit is complete: `shape-up` and `product-delivery` apply their gate criteria as a checklist and a human decides, with `decided_by` recorded. With it, System One decides those gates and `unavailable` is never a pass. Harness ASDD phases, the invariants, and the command gate never call Jev.

```bash
npx asdd-harness-kit /path/to/repo --modules=jev          # add (also part of --modules=all)
npx asdd-harness-kit /path/to/repo --remove-modules=jev   # remove; later runs keep it off
```

An upgrade keeps Jev in a project that already has it. The module installs:

| File | Role |
|---|---|
| `.harness/scripts/jev-client.mjs` | The only HTTP client: `POST {endpoint}/systemone` |
| `.harness/scripts/jev-gates.mjs` | Shape Up, scope, EARS, and hill gates (the library behind the MCP server) |
| `.agents/mcp/jev-gate-server.mjs` + `jev-gate` entry in `mcp.json` | `jev_status`, `jev_shape_up_gates`, `jev_scope_choice`, `jev_ears_gate` (`check_command_safety` there is deprecated; use `command-gate.mjs`) |
| `.harness/steering/jev.md` | Pass rules and thresholds (appetite ≥ 4, rabbit hole ≥ 0.80, EARS ≥ 0.85); loaded by the two skills, not on every session |
| `capabilities.jev` in `.harness/config/project.json` | `apiKey` stays empty; the key comes from the environment |

```bash
export JEV_API_KEY="…"                    # or .env / .env.local — never commit it
node .harness/scripts/jev-client.mjs status
node .harness/scripts/jev-gates.mjs health
```

```json
"jev": {
  "enabled": true,
  "required": false,
  "required_by": ["shape-up", "product-delivery"],
  "apiKey": "",
  "endpoint": "https://api.typesafe.ai/v1",
  "fallbackPolicy": "fail-closed"
}
```

---

## Spec drift and codebase audit

Steering instructions alone do not keep code and specs aligned: an agent can edit unmapped files, a `passing` feature's evidence goes stale when its files change, and nobody re-checks REQ → feature → test coverage. Three sensors close that gap. Usage by role: [`spec-drift.md`](.harness/steering/spec-drift.md).

| Sensor | Kind | Runs | Output |
|---|---|---|---|
| Spec drift check | Computational | Verify-on-Stop and CI, in seconds | FAIL/WARN lines in `check-invariants` |
| Codebase auditor | Computational, then inferential | On a schedule | `.harness/audits/<timestamp>.json` |
| `spec-drift-auditor` MCP server | Read-only view of both | On demand from chat | JSON, resources, prompts, optional dashboard |

All three share one library (`drift-lib.mjs`, `audit-lib.mjs`), so the same logic runs in the stop hook, in CI, and from chat.

### Drift checks

| ID | When | Detects | Result |
|---|---|---|---|
| `DRIFT-01` | A slice is editing | A changed product file not covered by the slice's mapped files | FAIL |
| `DRIFT-02` | Always | A `passing` feature whose `scope_paths` changed after `evidence_commit` | FAIL; the feature returns to `in_progress` |
| `DRIFT-03` | Phase `qa` or later | A MUST requirement with no feature listing it in `req_ids` | FAIL |
| `DRIFT-04` | Phase `qa` or later | A requirement ID that no test file mentions | WARN |
| `DRIFT-05` | Always | A `passing` feature's `scope_paths` entry that does not exist (a glob passes when one file matches) | FAIL |
| `DRIFT-06` | Always | A feature without `scope_paths`, or `passing` without `evidence_commit` | WARN; FAIL with `drift.contract: "fail"` in `project.json` |
| `DRIFT-07` | CI on a pull request | Product files changed, but the PR names no slice (branch `slice/<id>/…` or `Slice: <id>` in the body) | FAIL |

- **Mapped files** are the paths named in `intent.md`, `design.md`, `tasks.md`, or `spec.md`, the `scope_paths` of in-progress features, and test files (per the `Test file globs` binding) that name a REQ of the slice. Harness records and files the installer manages are exempt, so a kit upgrade is not drift.
- **`DRIFT-02`** compares `git log <evidence_commit>..HEAD -- <scope_paths>` plus uncommitted changes.
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
  "evidence_commit": "9897025"
}
```

### Codebase auditor

`audit-codebase.mjs` looks at code no active slice is touching:

1. Runs the drift checks across **all** slices.
2. Lists **unowned code** — product files no feature owns (test files excluded).
3. Runs the project's `Audit commands` and architecture Gate command. An unfilled binding is reported as `unconfigured`, never as a pass.
4. Ranks hotspots by churn, requirement links, and findings, then writes `.harness/audits/<timestamp>.json`.

The inferential pass is the `codebase-audit` skill: for the top hotspots it traces each file to its requirements (`knowledge_trace`), reads the EARS criteria and the code, and judges each `satisfied`, `violated`, or `unclear` with file and line evidence. `unclear` is never reported as `satisfied`.

- The auditor never edits code. A confirmed finding becomes a new slice or a task in the owning slice.
- Findings have stable IDs and occurrence counts. At three occurrences the finding becomes a [learning signal](#self-improving-harness): change the guide or sensor that let it through.
- Inferential findings are advisory until the Tech Lead confirms them.
- Dismissals live in `.harness/audits/triage.json` (finding ID, reason, who, when, and a hash of the files). Any change to that code brings the finding back. `audit-triage.mjs` records them; the MCP server never writes.
- The runner is the project's choice. An example GitHub Actions workflow installs to `.harness/examples/harness-audit.yml.example`; whichever runner is used must commit or upload `.harness/audits/`.

### MCP server `spec-drift-auditor`

A dedicated, dependency-free server (`.agents/mcp/spec-drift-auditor.mjs`), separate from `knowledge`: knowledge is process memory, the auditor is governance. Every tool is read-only and returns JSON text.

| Tool | Does |
|---|---|
| `audit_diff` | Drift checks plus architecture rules on a diff. `mode: "review"` adds `DRIFT-07` and applies triage. Defaults: base from the `Drift base branch` binding, target `HEAD` plus the working tree |
| `verify_architecture_rules` | Loads `domain-layer.md`, the project bindings, `product.md`, `structure.md`, and `tech.md` (unfilled stubs are marked, not quoted). Uses `.semgrep.yml` (or the `Semgrep rules` binding), or generates a temporary config from a `Paths \| Must not import` table and the `Language` in `tech.md`, runs `semgrep scan --json`, and returns violations with fixes. Also runs the bound Gate command. A missing binary, command, or rules is not a pass |
| `verify_spec_compliance` | Per slice: the core `ears` adapter (`DRIFT-03`/`04`) plus module adapters such as `openapi` from `http-api` |
| `generate_ci_gate` | CI config text (GitHub or GitLab) that runs `check-invariants.mjs`; it writes no files and carries no threshold |
| `audit_report` / `audit_finding` | Latest audit, filtered; one finding with its REQ → feature → file trace |

Resources: `spec://manifest`, `spec://rules/architecture`, `spec://drift/latest-report`, and `ui://spec-drift/dashboard`. Prompts are thin pointers to skills and steering: `architecture-review`, `spec-alignment` (per-REQ `satisfied` / `violated` / `unclear`), and `pr-review` (draft comments ordered 🔴 FAIL, 🟡 WARN, 🔵 advisory — never posted by the server).

**Dashboard.** On hosts that render MCP Apps, the tools show a prebuilt single-file HTML view; others get the same JSON. Actions only post messages to the conversation: *Trace* (both modes), *Send to agent as task* (author), *Draft comment* and *Dismiss…* (review). Results for the view stay under 8 KB (Cursor stops mounting the view above about 13 KB); larger results are paged with `page_token` and `offset`. Cursor renders widgets only from servers registered globally with `HARNESS_ROOT` ([`.agents/mcp/README.md`](.agents/mcp/README.md)).

### Team roles

| | Engineers | Tech Lead |
|---|---|---|
| Main loop | The ASDD pipeline per slice, lite by default | Pull request review and a weekly codebase health check |
| Uses | The full harness and Verify-on-Stop | `pr-review`, `audit_diff` in review mode, `verify_spec_compliance`, `audit_report` |
| Owns | Their slices' specs, features, `scope_paths`, and evidence | Bindings, ADR exceptions, Design sign-off, escalation calls, triage |
| Writes | Product code in mapped files | Review comments, `triage.json`, bindings — no product code during review |

1. The engineer passes Verify-on-Stop and opens a PR linked to the slice.
2. CI runs `check-invariants.mjs`. A red PR goes back without review, so the Tech Lead's time goes to what machines cannot judge.
3. The Tech Lead runs `pr-review`, then confirms each advisory finding (it becomes a task in the engineer's slice) or dismisses it with a reason.
4. The Tech Lead posts the review with their own tooling; the server has no GitHub token.
5. The engineer fixes it in a normal session.

Engineers work in separate slices, or in one slice with disjoint `scope_paths`. A check that is dismissed repeatedly is producing false positives — tune or remove it. Make the Tech Lead code owner of the gate files, bindings, `controls.md`, and hook config so an agent cannot loosen them without review (example: `.harness/examples/CODEOWNERS.harness.example`).

---

## Self-improving harness

Sensors catch a failure once. The learning loop catches the *same* failure coming back, and changes the guide or sensor that let it through — then checks that the change worked. Every step is deterministic except writing the proposal, and humans decide every change.

```text
signals ──► learn.mjs ──► LP-* pattern ──► SP-* proposal ──► Tech Lead ──► applied
   ▲                                                                       │
   └──────────── recurrence after the change → ineffective, pattern reopens ┘
                 10 quiet sessions in its area → verified
```

**Signals** are read where they already live; recorded invariants runs and command-gate denials are the only new writers. A `passing` feature reopened by `DRIFT-02` shows up as `sensor:DRIFT-02:<area>`.

| Source | Signature | Kind |
|---|---|---|
| Failing `check-invariants.mjs --live` or `--record` run — Verify-on-Stop, an agent on a runtime without hooks, or CI | check code + area, e.g. `sensor:DRIFT-01:docs`; runs within 30 min count once | escape |
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

**Storage.** A failing run writes a raw file to `.harness/state/learning/signals/` (gitignored). Every `learn.mjs` run — so every `sync-state.mjs` — folds those into `.harness/state/learning/summaries/<ISO-week>-<author>.json`, which is committed. Only that author writes that file, so summaries never conflict in git and the team shares one count. The author is `HARNESS_AUTHOR`, else your git user name. Pull-request CI records and prints patterns but cannot persist them; the scheduled audit workflow (`.harness/examples/harness-audit.yml.example`) records failures on the default branch as author `ci` and commits them.

**Patterns.** `learn.mjs` (also run by every `sync-state.mjs`) groups signals by signature into `LP-*` patterns in `.harness/state/learning/patterns.json` (generated). A pattern is `open` at three occurrences.

**Proposals.** `node .harness/scripts/learn.mjs --propose <LP-id>` scaffolds `docs/knowledge-base/steering-proposals/SP-NNN.md` from the template. Its frontmatter is the contract:

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

`rejected` is a recorded "won't fix" and closes the pattern. A pattern about an area (`sensor:DRIFT-01:docs`) is verified only by sessions whose `scope_paths` touch that area. To keep failure-log repeats countable, reuse an existing signature: `learn.mjs --signatures` (or `failure_signatures` in `knowledge_patterns`). `product-code` proposals are implemented by the Refactor agent as Self-Healing PRs.

**Gate** (`validators/learning.mjs`, inside `check-invariants.mjs`):

| Rule | Result |
|---|---|
| A pattern is `open` with no proposal, or its applied proposal is `ineffective` | WARN |
| A proposal is malformed (unknown pattern, missing control file, unfilled success, decided without `decided_by`, applied without `applied_commit`) | FAIL |
| `applied_commit` is not a commit, or does not change the `control` file | FAIL |
| A slice completes Knowledge while a pattern it contributed to is `open` | FAIL |

**In review.** `audit_diff` returns a `learning` block — open patterns, marked `relevant` when they are about a changed area or a linked slice — and the `pr-review` prompt turns relevant ones into advisory comments. It never blocks a PR.

**Back to the kit.** `learn.mjs --export --out lessons.md` writes the verified and ineffective proposals on kit-owned controls, with generic fields only (no examples, slice names, proposal text, or commands), and prints the `gh issue create` command to send it to the kit. Nothing is sent automatically.

Rules: `QG-LEARN-01`…`09` in [`quality-gates.md`](.harness/steering/quality-gates.md). See open patterns with `harness-status.mjs`, `learn.mjs`, or the `knowledge_patterns` MCP tool.

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
| Invariants before handoff | `check-invariants.mjs` exits 0; the same failure three times changes the guide or sensor that missed it |
| Mapped files only | Product edits stay inside the active spec; no unrequested refactors |
| One numeric gate | Cutoffs live only in `quality-gates.md` |
| Traceability and stable identity | Every pitch, scope, intent, REQ, and task has an ID, and downstream artifacts link upstream |
| Unconfigured is not a pass | A missing tool, binding, or key is reported, never counted as success |

---

## What's inside

**Agents** (`.agents/agents/`) — Discovery, Spec, Validation, Domain, Design, Task Planning, Implementation, QA, Knowledge, Refactor, and Lite. Runtime-agnostic markdown.

**Skills** (`.agents/skills/`) — Shape Up, Product Delivery, External Trackers, Capability Discovery, Domain-Language Extraction, Test-Driven Development, Documentation & ADRs, Open Code Review, Anti-Pattern Detection, Codebase Audit, Business Model Canvas, and Create MCP App. Agents see names and descriptions ([`skills.md`](.harness/steering/skills.md)) and read a skill's body only when the task starts.

**Steering** (`.harness/steering/`)

| File | Purpose |
|---|---|
| `product.md`, `structure.md`, `tech.md`, `design-system.md` | Project bindings: product, layout, stack, UI |
| `domain-layer.md` / `.project.md` | Domain boundaries and ubiquitous language |
| `quality-gates.md` / `.project.md` | EARS gates; test commands, drift and audit bindings |
| `session-loop.md`, `manifest.md` | Session open/close, file scope, evidence; the phase machine |
| `asdd-lite.md` | Lite mode and escalation |
| `spec-drift.md`, `knowledge.md`, `codegraph.md` | Drift sensors, knowledge index, code intelligence |
| `controls.md` | Which guide or sensor wins on a conflict |
| `security-rules.md`, `skills.md` | Security rules, skills index (`jev.md` only with the Jev module) |
| `templates/` | Artifact templates for every phase |

**Harness** (`.harness/`) — `scripts/` (invariants, drift, audit, state, knowledge, learning; Jev with its module), `scripts/validators/`, `state/`, `specs/`, `features/`, `audits/`, and `PROGRESS.md`.

**MCP servers** (`.agents/mcp/`) — `knowledge` (`knowledge_search`, `knowledge_trace`, `knowledge_slice`, `knowledge_status` over a SQLite index, plus `knowledge_patterns` for the learning loop of specs, requirements, features, and sessions; semantic search when `KNOWLEDGE_EMBEDDINGS_URL` and `KNOWLEDGE_EMBEDDINGS_MODEL` are set, lexical otherwise), `spec-drift-auditor`, `jev-gate`, and `codegraph`.

**Modules** (`.agents/modules/`, opt-in) — `bruno` (integration testing agent), `playwright-e2e` (end-to-end testing agent), `web-ui` (UI skills), and `http-api` (API design skills and the `openapi` compliance adapter).

**Runtime recipes** (`runtimes/`) — Cursor, Claude Code, OpenCode, Kimi Code, Junie, Devin, and Kiro. The installer wires agents, skills, and MCP into each runtime; the recipes themselves stay in this kit.

---

## Requirements

- **Node.js 22+** (22.5+ for the SQLite knowledge index)
- **git** — drift checks and installer `--from-git`
- **`JEV_API_KEY`** — only when running `shape-up` or `product-delivery`
- **semgrep** — optional, for `verify_architecture_rules`
- **[codegraph](https://www.npmjs.com/package/codegraph)** — recommended (`npm i -g codegraph`)

---

## Documentation

| Document | Covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Operational map — read every session |
| [`runtimes/README.md`](runtimes/README.md) | Per-runtime wiring |

---

## Developing the kit

The kit is developed with the kit: every change goes through a slice in this repository, and `node .harness/scripts/check-invariants.mjs` must pass before a commit.

- **Mode.** Use `init-slice.mjs <id> --full`. Almost every kit change touches `.harness/`, `scripts/`, and `.agents/`, so a lite slice would raise E1 on its first feature (see `docs/knowledge-base/steering-proposals/SP-001.md`).
- **Bindings.** `.harness/steering/{product,structure,tech,domain-layer.project,quality-gates.project,design-system}.md` describe the kit itself. The stubs that projects receive live in `scripts/templates/bindings/`.
- **Kit-only artifacts.** This repo's slices, specs, features, sessions, archive, learning state, audits, `project.json`, bindings, and steering proposals are never installed into a project and never published to npm (`files` negations in `package.json`). `scripts/test-install-into.sh` fails if one leaks.
- **Closed work.** A slice that will not reach DONE is moved to `.harness/state/archive/<id>/` with a `<id>.json` record; the learning loop still reads its sessions.

---

## License

MIT — see [LICENSE](LICENSE).
