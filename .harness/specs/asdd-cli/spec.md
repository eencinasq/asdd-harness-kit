# asdd-cli — Spec (lite)

## Intent

Replace `scripts/*` with one Node CLI, `asdd`, in `cli/` (modeled on the eminzo-ai-factory `cli/`: `bin/` entry,
`src/main` dispatch, `doctor`, no dependencies). `asdd install` is a port of `install-into.sh` with the same options,
phases, copy policies, and version tracking; `doctor`, `repair`, and the kit's `kit versions|vendor|guidance` absorb the
other scripts. Templates and kit tests move under `cli/`. `scripts/` is removed.

## Requirements

- **REQ-001.** `asdd install <dir>` shall accept every option of `install-into.sh` and produce the same installed project (the install smoke test passes unchanged in its assertions).
- **REQ-002.** `npx asdd-harness-kit <dir> [options]` and `--interactive` (the pre-CLI form) shall still install; with no target in a terminal, install shall run the wizard.
- **REQ-003.** `asdd doctor [dir] [--json]` shall report Node, git, npm and, in a project, the installed kit version, bindings, built MCP servers, the Jev key (jev module), and `sqlite-vec`, exiting 1 only on a failed check.
- **REQ-004.** `asdd repair` and `asdd kit versions|vendor|guidance|build` shall replace `harness-migrate.mjs`, `migrate-v2-v3.mjs`, `generate-versions.mjs`, `vendor-harness-libs.mjs`, and `check-guidance.mjs`.
- **REQ-005.** An install shall remove the kit's old copy of `scripts/install-into.sh` from the project, and only when it is still the kit's copy.
- **REQ-006.** The npm package shall ship `cli/{bin,dist,templates}` and `cli/README.md`, and not `cli/src/`, `cli/test/`, or `scripts/`.
- **REQ-007.** On an upgrade, `asdd install` shall leave a kit file the project changed since the kit wrote it (by the sha256 in `installed-versions.json` `kit_files`), report it, and record it in `skipped_files`; `--force` shall take the kit version.
- **REQ-008.** `asdd install` shall refuse while `.harness/.installing` exists (an interrupted install) and when the project has a newer kit than the CLI, unless `--force`.
- **REQ-009.** `asdd install --json` shall print one JSON object on stdout: the result (versions, file counts, skipped files) or the error (with preflight problems).
- **REQ-010.** `asdd install --pr` shall install on a new branch from `origin/<default>`, commit, push, and open a pull request with `gh`, after a preflight that names every problem; a failure before the commit shall leave the repository as it was.
- **REQ-011.** `asdd uninstall [dir]` shall remove what install added and the project did not change, take the kit's entries out of `mcp.json`, hooks, and `.gitignore`, and keep the project's own files and changes.
