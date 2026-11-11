# Runtime adapters

IDE folders (`.cursor`, `.claude`, `.kiro`, …) are **not** the SoT. Symlink agents/skills/MCP to `.agents/` and keep SoT under `.harness/`.

## Cursor

```bash
mkdir -p .cursor/rules .cursor/agents .cursor/skills
# Prefer directory symlinks when the IDE allows:
ln -sfn ../../.agents/skills .cursor/skills
# Per-agent files (Cursor often expects files under .cursor/agents/):
for f in .agents/agents/asdd-*.md; do
  ln -sfn "../../.agents/agents/$(basename "$f")" ".cursor/agents/$(basename "$f")"
done
ln -sfn ../.agents/mcp/mcp.json .cursor/mcp.json
cp cli/runtimes/cursor/asdd-steering.mdc .cursor/rules/asdd-steering.mdc
```

The Cursor `stop` hook in `.cursor/hooks.json` runs `asdd verify` before the agent session ends. That script runs `asdd check` and, on FAIL, submits the error as the next user message. `asdd install <dir> --runtime=cursor` installs the hooks and keeps an existing `hooks.json` entry for verify. Projects get no copy of the CLI: each hook runs a short POSIX line that uses the project's `node_modules/.bin/asdd` (a devDependency), else `asdd` on the PATH (a global install), and fails closed with how to install it when neither exists. Native Windows shells are not supported for the hooks (WSL and Git Bash are).

## Claude Code

```bash
mkdir -p .claude/agents
ln -sfn ../.agents/skills .claude/skills
for f in .agents/agents/asdd-*.md; do
  ln -sfn "../../.agents/agents/$(basename "$f")" ".claude/agents/$(basename "$f")"
done
ln -sfn .agents/mcp/mcp.json .mcp.json
# Point CLAUDE.md at AGENTS.md
echo 'Follow [`AGENTS.md`](AGENTS.md).' > CLAUDE.md
```

## OpenCode

The installer creates .opencode/agents links, a .opencode/skills link, and
the project-level opencode.json MCP projection.

## Kimi Code

The installer creates .kimi-code/agents and .kimi-code/skills links plus
.kimi-code/mcp.json.

## Junie

The installer creates Junie agent and skill links plus
.junie/mcp/mcp.json. Existing Junie settings and hooks are preserved.

## Devin

The installer creates Devin agent and skill links plus
.devin/mcp_config.json. Existing Devin configuration is preserved.

## Kiro

The installer creates Kiro agent and skill links plus
.kiro/settings/mcp.json. Kiro hooks remain project-specific.

## Other IDEs

Same pattern: agents → .agents/agents, skills → .agents/skills, MCP →
.agents/mcp/mcp.json. Codex and OpenCode projections are generated with
node .agents/mcp/sync-runtime-mcp.cjs.

## Enabling modules

Enable modules from the kit, not from a consuming repository:

    npx asdd-harness-kit install /path/to/repo --modules=web-ui

The module sources stay under cli/modules/ in the kit repository; selected skills
or agents are copied into the project.
