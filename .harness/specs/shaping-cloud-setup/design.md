# shaping-cloud-setup — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/runtimes/claude/cloud-setup.sh` | New. `bash cloud-setup.sh [--plan\|--check]`. Steps: (1) prerequisites — node ≥ 22 and the version-control CLI; (2) resolve the asdd CLI — kit checkout `node cli/bin/asdd.mjs`, else `node_modules/.bin/asdd` (running `npm ci` when `package.json` lists `asdd-harness-kit` and `node_modules` is missing), else `asdd` on PATH; (3) MCP servers — only when `tools/knowledge` / `tools/spec-drift` exist: needs Node ≥ 24.22.1 (`node` on PATH, or `ASDD_NODE24_BIN`) and pnpm, then `pnpm install --frozen-lockfile && pnpm build` per server; (4) codegraph — `npm i -g codegraph` when missing (the command `asdd doctor` prints), then `codegraph init` without `.codegraph/`, else `codegraph sync`; (5) `asdd knowledge sync`; (6) `asdd doctor` as an informational report. `set -euo pipefail`, labeled steps, idempotent. `--plan` prints the steps; `--check` reports OK/MISSING per prerequisite and exits 1 when a required one is missing. |
| `cli/test/cloud-setup.test.mjs` | New. Syntax check (`bash -n`); `--plan` lists the steps in order and writes nothing; `--check` with stub binaries on a controlled `PATH` (Node 22 without pnpm in a kit-like tree → exit 1 naming the missing prerequisites; Node 24 + pnpm + codegraph → exit 0). No real install or build. |
| `package.json` | One `test` script entry for the new test. |
| `cli/runtimes/claude/README.md` | Cloud environments: where the script lives (kit checkout `cli/runtimes/claude/cloud-setup.sh`; projects `node_modules/asdd-harness-kit/cli/runtimes/claude/cloud-setup.sh` after `npm ci`), how to set it as the environment setup script, env vars (`ASDD_NODE24_BIN`, `HARNESS_AUTHOR`). |
| `docs/PLAYBOOK.md` | Play O (PO/PM shaping) and Play P (engineer intake); rows in §2 and §6; the known Bash-write gap of the shaping agent. |
| `README.md`, `cli/README.md` | A short "PO → tracker → engineer" paragraph linking Plays O and P. |

The installer does not copy the script into projects: it ships in the npm package (`cli/runtimes/**` is in `files`), and projects run it from `node_modules`.

## New domain terms

None.

## ADRs

None.
