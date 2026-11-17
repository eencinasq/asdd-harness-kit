# claude-hook-cwd — Spec (hotfix)

## Intent

Claude Code runs hooks in the session's current directory. When the session moves into a subfolder (e.g.
`tools/spec-drift`), the kit's Stop hook `node cli/bin/asdd.mjs verify` fails with `Cannot find module
…/tools/spec-drift/cli/bin/asdd.mjs`, and a project's resolver would run `asdd` against the subfolder (asdd uses the
current directory as the repository root). Start every Claude Code hook at the project root, `${CLAUDE_PROJECT_DIR}`,
which Claude Code sets for hooks (fallback: the current directory); upgrade existing installs without double wrapping.

Mapped: `cli/src/install/phases.mjs`, `cli/src/install/runtimes.mjs`, `cli/test/install.sh`, `cli/src/uninstall.mjs` (recognize the wrapped hooks), `.claude/settings.json` (this repo's own hooks, rewritten by `asdd install`)

## Requirements

- **REQ-001.** Every Claude Code hook the installer writes (gate, verify, observe) shall change to `${CLAUDE_PROJECT_DIR:-.}` before running asdd; when that change fails, gate and verify shall exit 2 (blocking) and observe shall exit 0 (fail-open).
- **REQ-002.** Re-running the installer on an existing install shall upgrade unwrapped Claude Code hook commands to the wrapped form, exactly once, and leave already wrapped commands unchanged.
- **REQ-003.** A Claude Code hook run from a subfolder of the project shall run asdd at the project root.
