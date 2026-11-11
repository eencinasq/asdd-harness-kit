# cli-harness — Spec (lite)

## Intent

The harness is part of the `asdd` CLI. `.harness/scripts/` moves to `cli/src/harness/`; every command has an `asdd`
name (`asdd check`, `verify`, `gate`, `sync`, `knowledge …`, `drift`, `audit`, `learn`, `jev …`). A project gets a copy
of the CLI's runtime in `.harness/cli/` (committed, pinned to the installed kit); hooks call it directly, agents and
skills run `asdd <command>` (or `node .harness/cli/bin/asdd.mjs`), and a global `asdd` hands harness commands to the
project's copy. `.harness/` keeps only the project's data. The kit installs itself: `.harness/cli` links to `cli/`.

## Requirements

- **REQ-001.** `asdd <command>` shall run each harness command of `cli/src/harness/` on the nearest folder up that has `.harness/`, with the arguments, stdin, output, and exit status of the former `node .harness/scripts/<name>.mjs`.
- **REQ-002.** `asdd install` shall copy the CLI runtime (harness commands including `repair`, `doctor`; no install, kit, or tests) into `.harness/cli/` with the kit version, and refuse `install`/`uninstall`/`kit` from that copy.
- **REQ-003.** On an upgrade, `asdd install` shall remove the kit's files from `.harness/scripts/` (keeping a project's own), rewrite kit hooks and the default `project.json` commands to the project CLI, and keep a project's own hooks.
- **REQ-004.** A global `asdd` run in a project with `.harness/cli` shall hand harness commands to that copy.
- **REQ-005.** Agents, skills, steering, `AGENTS.md`, runtimes, CI, the MCP servers' messages and CI templates, and the shipped examples shall name `asdd` commands, not `.harness/scripts`.
- **REQ-006.** The kit repo shall run its harness as installed: `.harness/cli` links to `cli/`, and its hooks and CI call `node .harness/cli/bin/asdd.mjs`.
- **REQ-007.** The optional modules and the runtime recipes shall live in the CLI (`cli/modules/`, `cli/runtimes/`); the installer, `asdd kit versions`, the npm package, and the spec-drift module adapters shall read them there.
- **REQ-008.** Everything a project receives under `.harness/` (portable steering and templates, config schema and README, `models.json`, feature schema, folder READMEs, `versions.json`) shall live in the CLI (`cli/steering/`, `cli/scaffold/`, `cli/versions.json`); the kit shall install itself by copying them into its own `.harness/` (never links), and `asdd kit self --check` shall fail while a copy is stale.
- **REQ-009.** The agents, the skills catalog, the MCP config and launchers, and `AGENTS.md` shall live in the CLI (`cli/agents/`, `cli/skills/`, `cli/mcp/`, `cli/AGENTS.md`); `asdd install` shall copy them into a project (`.agents/…`, `AGENTS.md`), and the kit shall hold them as copies refreshed by `asdd kit self`.
- **REQ-010.** Codegraph shall be a skill (`cli/skills/codegraph`) on the codegraph CLI, used by every agent and skill that explored code through the codegraph MCP; the kit shall ship no codegraph MCP server, an install shall remove the kit's codegraph MCP entry, launcher, and steering, and `asdd doctor` shall report the codegraph binary and the `.codegraph/` index (failing when `capabilities.codegraph.required`).
- **REQ-011.** A feature shall become `passing` without a commit SHA: `asdd sync` shall record `evidence_hash` (sha256 of the files its `scope_paths` cover) and clear it when the feature leaves `passing`; `DRIFT-02` shall reopen a passing feature whose hash no longer matches; `DRIFT-06` shall not require `evidence_commit`, which `asdd sync` removes.
- **REQ-012.** `asdd install` shall install no npm packages in the project; the knowledge index shall use `node:sqlite` and exact cosine search, and an upgrade shall remove the `.harness/package.json`, `package-lock.json`, and `node_modules` older kits installed (only when that package is the kit's).
- **REQ-013.** Jev shall not be part of the harness or the ASDD pipeline: no `asdd` command, skill, agent, hook, or install shall use it, and an upgrade shall remove the old jev module (its files, `capabilities.jev`, `modules.jev`). Jev shall remain only as the kit's `jev-gate` MCP server, owning its gate logic and configured by `JEV_API_KEY`.
- **REQ-014.** In the kit, `asdd` shall never run a `cli/dist/` older than `cli/src/` (it runs `src/` until rebuilt); `asdd install` shall refuse, before writing anything, a project whose ignore rules hide committed harness files (`--force` overrides) and warn for ignored runtime hook files, and `asdd doctor` shall report both; `npm publish` shall run the kit tests first.
- **REQ-015.** The CLI shall never be copied into a project: `asdd` is the `asdd-harness-kit` package, installed once per machine (`npm i -g`, or built from the repository with `npm pack`) or as a project devDependency. Hooks shall resolve `node_modules/.bin/asdd`, else `asdd` on the PATH, and fail closed with how to install it; a global `asdd` shall hand off to the devDependency, and without one shall refuse another major of the project's `kit.version` (warn for another minor). Upgrades shall remove an older kit's `.harness/cli/` and move its hooks to the resolver; the npm package shall contain every file the installer copies.
