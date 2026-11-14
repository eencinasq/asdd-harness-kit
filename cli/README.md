# asdd CLI

The command line of asdd-harness-kit, and the harness itself: every harness command (`asdd check`, `asdd sync`,
`asdd knowledge search …`, the hooks `asdd verify` and `asdd gate`) is authored in `cli/src/harness/` and compiled to
`cli/dist/` (`npm run build` / `asdd kit build`). The npm package ships **`dist/` only** (no `src/`).
`cli/bin/asdd.mjs` runs `dist/`; in the kit (the only place with `src/`) it runs `src/` while `dist/` is missing or
older than `src/` (it compares the fingerprint `asdd kit build` writes to `dist/build.json`), so hooks never run stale code. It also installs and
upgrades the kit in a project, checks an install, repairs harness state, and holds the kit's own maintenance
commands. Node.js 22 or newer; runtime is Node built-ins only (esbuild / javascript-obfuscator are build-time
devDependencies). It ships in the `asdd-harness-kit` npm package.

## Where asdd comes from

The CLI is **never copied into a project**. It is the `asdd-harness-kit` npm package:

- **Per project** (`npm i -D asdd-harness-kit`): pinned by the project's lockfile. Run it with `npx asdd <command>`.
  A global `asdd` run inside the project hands harness commands to this one, so every developer, agent, and hook runs
  the pinned version.
- **Global** (`npm i -g asdd-harness-kit`): for repositories without a `package.json`. With no devDependency, `asdd`
  checks the kit version the project installed (`kit.version` in `.harness/config/project.json`): another major is
  refused with how to fix it, another minor warns (on stderr; `gate` and `verify` stay quiet).
- **Hooks** (Cursor, Claude Code) run a short POSIX line, with nothing of the CLI in the project:
  `node_modules/.bin/asdd` if it exists, else `asdd` on the PATH, else exit 2 with how to install it (fail closed).
  It starts in about 40 ms (`npx` takes about 0.7 s and does not find a global install, so the hooks do not use it).
  Native Windows shells are not supported for the hooks; WSL and Git Bash are.
- **CI** installs the exact version the project recorded:
  `npm i -g "asdd-harness-kit@$(node -p "require('./.harness/config/project.json').kit.version")"`.
- **This kit repo** runs `cli/` itself: its hooks, CI, and `project.json` commands run `node cli/bin/asdd.mjs`. Its
  `.harness/`, `.agents/`, and `AGENTS.md` are the harness as installed: `asdd kit self` (or `asdd install .`) copies
  the shipped steering, templates, schemas, `models.json`, `versions.json`, agents, skills, MCP config, and agent map
  into them, so the kit's agents read exactly what a project gets. Sources live in `cli/` (`cli/steering/`,
  `cli/scaffold/`, `cli/src/harness/`); edit them there, then run `asdd kit self`. `asdd kit self --check` (in
  `npm test` and CI) fails while a copy is stale. Only the copies are recorded in `installed-versions.json`, so `cli/`
  stays under spec drift.

Older kits copied the CLI into `.harness/cli/` (and before that the harness into `.harness/scripts/`). `asdd install`
removes both (a project's own scripts in `.harness/scripts/` stay) and moves the hooks to the resolver.

## Harness commands

Which command to run when: [the playbook](../docs/PLAYBOOK.md).

They run on the nearest folder up that has `.harness/`. `asdd help` lists every name. Older installs had them as
`node .harness/scripts/<name>.mjs`, then as a copy in `.harness/cli/`; `asdd install` removes both, rewrites the kit
hooks and the `project.json` commands, and keeps a project's own scripts in `.harness/scripts/`.
`asdd repair` restores a consistent harness layout (dirs, sessions, specs, features) and then runs `sync`.

Roadmap P0–P4 shipped these session-facing commands (see [`docs/ASDD-ROADMAP.md`](../docs/ASDD-ROADMAP.md)):

| Command | Purpose |
|---|---|
| `asdd status [--metrics\|--json\|--html]` | Slices, escalation, hill; pipeline metrics; HTML dashboard |
| `asdd init-flow` | 15-minute brownfield: install if needed, one lite slice, check |
| `asdd converge [--slice] [--strict] [--json]` | Cheap REQ / test-mention / evidence sensor (also in `asdd check`) |
| `asdd converge-eval` | Score `cli/eval/converge-ears/` fixtures |
| `asdd slice init <id> [--hotfix\|--full]` | Presets: hotfix / lite (default) / full |
| `asdd slice amend <id>` | Reopen DONE with `amendments/<stamp>.md` |
| `asdd slice escalate <id> --reasons "…"` | Lite/hotfix → escalated |
| `asdd waves [--slice] [--json]` | Parallelism hints from owners + deps + scopes |
| `asdd portfolio [--json]` | Read-only multi-repo summary (`portfolio.json`) |
| `asdd tracker-sync [--apply]` | Plan tracker sync from handoff + sessions; `--apply` = local receipt |
| `asdd spec-source` | Opt-in MUST REQ inventory (`capabilities.spec_as_source`) |

Also: `check`, `verify`, `gate`, `drift`, `check-config`, `skills-index`, `sync`, `repair`,
`knowledge sync|search|trace|slice|status|patterns`, `learn`, `audit`, `triage`.

Agent skills that wrap the CLI (do not invent SoT): `asdd-status`, `asdd-next`, `asdd-implement`, `asdd-converge`
under `cli/skills/`. PO/PM path: `shape-up` (concepts brief + critique-first review) → `product-delivery`
(Goldfish scope-split + **intent fitness** before `slice init`). Guides:
[`docs/guides/spec-kit-to-asdd.md`](docs/guides/spec-kit-to-asdd.md),
[`docs/guides/spec-as-source.md`](docs/guides/spec-as-source.md); playbook Play C.

Stop hook mode: default fail-closed; set `stop.mode: "advisory"` in `.harness/config/project.json` or
`HARNESS_STOP_MODE=advisory` so Verify-on-Stop still runs `check --live` but does not block the session.

```sh
npx asdd-harness-kit install /path/to/repo --runtime=cursor,claude --modules=http-api
npx github:eencinasq/asdd-harness-kit install /path/to/repo     # without npm publishing
npm i -g asdd-harness-kit && asdd install /path/to/repo           # `asdd` on the PATH
npm i -D asdd-harness-kit                                        # or per project (pinned by the lockfile)
node cli/bin/asdd.mjs install /path/to/repo                      # from a clone of the kit
```

## Commands

| Command | What it does |
|---|---|
| `asdd install <dir> [options]` | Install or upgrade the kit in `<dir>`. `asdd install --help` lists every option (`--runtime`, `--modules`, `--force*`, `--skip-*`, `--dry-run`, `--from-git`, `--kit-dir`, `--interactive`). An unknown module or runtime (including `jev`, which is not a module) fails before anything is written. |
| `asdd install --interactive` | The same as a wizard: target, runtimes, modules, refresh, dry run. The default with no target in a terminal. |
| `asdd install <dir> --pr` | The same as a pull request: a branch `chore/asdd-harness-kit-<version>` from `origin/<default>`, the install, a commit, a push, and `gh pr create`. Needs a clean tree at the repository root, an `origin`, and `gh` signed in; each missing one is named. A failure before the commit puts the repository back as it was. |
| `asdd install <dir> --json` | One JSON object on stdout: `{ ok, version, previous, files: { created, updated, kept, skipped }, skipped, … }`, or `{ ok: false, error, problems? }`. Progress goes nowhere; child output goes to stderr. |
| `asdd uninstall [dir] [--dry-run] [--json]` | Removes what install added and the project did not change: kit files and unedited seeds (by hash), kit links, the kit's `mcp.json` servers, hooks, and `.gitignore` lines, and the `sqlite-vec` package older kits put in `.harness/`. Keeps specs, features, state, `project.json`, filled bindings, and every file the project changed. |
| `asdd doctor [dir] [--json]` | Node, git, npm, and in a project: which asdd it runs (devDependency, global, or none: fail) and whether it fits `kit.version`, ignore rules that hide committed harness files, installed kit version, bindings, `node:sqlite`, codegraph, semgrep, `gh`, and leftovers from older kits (`.harness/node_modules`). Exits 1 only when a check fails. |
| `asdd repair [--dry-run] [--slice <id>] [--json]` | Repair harness layout (slices, state, specs, features) and regenerate manifests/registry/PROGRESS. |
| `asdd kit versions [bump <version>]` | Kit repo only: regenerate `cli/versions.json` (every shipped artifact at the package version; installed as `.harness/config/versions.json`). `bump` also sets `package.json` and the lockfile. |
| `asdd kit build [--obfuscate] [--check]` | Kit repo only: compile `cli/src` → `cli/dist` (minify; optional obfuscate). `--check` fails while dist is missing or stale. |
| `asdd kit vendor [--check]` | Kit repo only: copy the `cli/src/harness` libraries each MCP server under `tools/` needs into `tools/<name>/src/harness/`; `--check` exits 1 when a copy is stale. |
| `asdd kit self [--check]` | Kit repo only: copy what `cli/` ships into the kit's own `.harness/` (it installs itself); `--check` exits 1 while a copy is stale. |
| `asdd kit guidance [--only stale,cutoffs,budget,asserts] [dir]` | Kit repo only: stale mechanisms in shipped guidance, numeric cutoffs in agent prompts, the always-loaded steering budget, bare `!` asserts in kit tests. |
| `asdd kit skills-lint [--only a,b] [dir]` | The skill grammar (`skill.spec` `S-*`: `Use when` and `Do NOT use` in the description, `metadata.tier`, operational boundary, typed Input / Output Contract, steps with Action / Target / Assertion, Verification Gate with a negative check, Escalation Gate, Handoff & Convergence, size caps, no absolute paths), the fleet rules (`SL-103`, `SL-105` duplicated blocks, `SL-301` handoff cycles, `SL-302` dangling references — a core skill may name only core skills), and `R-004`/`R-005` on `AGENTS.md` and the always-loaded steering. In the kit: `cli/skills` and `cli/modules/*/skills`; in a project: `.agents/skills`. `npm test` runs it. |
| `asdd kit agents-lint [--only a,b] [dir]` | The agent grammar (`agent.spec` `A-*`: `Use when` and `Do NOT use`, `metadata.tier`, `capabilities`, `limits.max_turns`, guarantees, Operational and Quarantine Boundary, Decision Rights, Pre-Flight Reading & Ground Truth (Tier 1–3), typed Delegation & I/O Contract with a verdict, Negative Space with `file:line` and anti-hedging, Convergence gate with a negative check, Escalation Gate, provenance, 20 KB cap, no manifest writes) and the fleet rules (`AL-103` tier vs capabilities: only an orchestrator spawns sub-agents, an auditor never edits, a researcher never writes; `AL-301` handoff cycles; `AL-302` dangling or cross-module names and unknown mounted skills). `asdd install` renders these capabilities into Claude Code, Cursor, and OpenCode agent files. `npm test` runs it. |
| `asdd --version`, `asdd help` | The kit version, and every command. |

`npx asdd-harness-kit <dir> [options]` and `npx asdd-harness-kit --interactive` (the form before the CLI) still install.

## Ownership and safety

`.harness/config/installed-versions.json` records the sha256 of every kit file as the kit wrote it (`kit_files`).
On an upgrade, a kit file whose version changed is updated, unless the project changed it since: then it is skipped
(`SKIP`, listed in the summary, in `skipped_files`, and by `asdd doctor`), and `--force` takes the kit version. While
an install writes files, `.harness/.installing` exists; if a run is cut off, the next install refuses until `--force`
(after a look at `git status`). An install older than the kit the project has (`project.json` `kit.version`) is refused;
`--force` downgrades.

## What install does

Kit-owned files (`refresh`) are copied when missing, when their version in `.harness/config/versions.json` changed, or
with `--force`. Project-owned seeds (`create`: bindings, `AGENTS.md`, logs, `mcp.json`, `PROGRESS.md`) are written once
and never overwritten. `.harness/config/installed-versions.json` records what the project received: the versions, the
kit-owned files (spec drift exempts them), and the hash of each seed (exempt only while unedited). The phases, in order:
1. portable steering and binding stubs;
2. the removal of an older kit's CLI copy (`.harness/cli/`) and its files in `.harness/scripts/`;
3. `project.json`;
4. agents, skills, and MCP (an empty project `mcp.json`: the servers in `tools/` stay in the kit);
5. retired kit files, including any previously copied `tools/{knowledge,spec-drift,jev-gate}` and everything the old
   `jev` module installed (`capabilities.jev`, `modules.jev`, its files, and the `jev-gate` MCP entry);
6. modules, the skills index, and runtime wiring (agents rendered for Claude Code, Cursor, and OpenCode from their
   `capabilities`; links elsewhere);
7. the removal of the `sqlite-vec` install older kits put in `.harness/` (the harness installs no npm packages);
8. the version manifest, and the project's own config and invariant checks.

Projects installed by the bash installer had a copy of it at `scripts/install-into.sh`; the next `asdd install`
removes it (only while it is still the kit's copy).

## Layout

```
cli/
├── bin/asdd.mjs          the command (runs dist/; in the kit, src/ while dist/ is missing or stale)
├── dist/                 compiled src/ without tests (what the npm package runs; never copied into projects)
├── src/main.mjs          dispatch and help (harness commands run in-process; a global asdd hands them to the project's devDependency)
├── src/harness/          the harness: commands.mjs (the asdd names) + every command and library; tests next to them
├── src/install/          options, context (copy policies, versions), phases, modules, runtimes, agent-frontmatter
│                         (renders agents per runtime), pr, index (the run)
├── src/doctor.mjs, src/uninstall.mjs, src/pin.mjs (which asdd a project runs, and whether it fits)
├── src/kit/              versions, build, vendor, self, guidance, skills-lint, agents-lint (kit repo only)
├── AGENTS.md             the agent map (→ project root, seeded once)
├── agents/ skills/       ASDD agents and the skills catalog (→ .agents/)
├── mcp/                  the kit's MCP config (knowledge, spec-drift, jev-gate) and launchers; projects get the
│                         launchers and an empty mcp.json (→ .agents/mcp/)
├── modules/              opt-in modules: bruno, playwright-e2e (agent + skill each), web-ui, http-api
├── runtimes/             runtime recipes: cursor, claude, opencode, kimi, junie, devin, kiro
├── steering/             portable steering + templates/ (→ .harness/steering)
├── scaffold/             .harness skeleton: config schema + README, models.json, feature schema, folder READMEs
├── versions.json         every shipped artifact at the package version (→ .harness/config/versions.json)
├── templates/            binding, log, and state stubs seeded into projects
└── test/                 install.sh, lifecycle.sh, full-flow.sh, cli.test.mjs, guidance.test.mjs (kit only, not packed)
```

Tests: `npm test` in the kit builds `cli/dist`, then runs `asdd kit vendor --check`, `asdd kit self --check`,
`cli/test/install.sh`, `cli/test/lifecycle.sh`, and the unit tests; `npm run test:full-flow` runs the Shape Up →
Product Delivery → ASDD flow. The MCP servers test inside `tools/<name>/` (`pnpm test`).
