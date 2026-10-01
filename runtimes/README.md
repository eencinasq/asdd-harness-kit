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
cp runtimes/cursor/asdd-steering.mdc .cursor/rules/asdd-steering.mdc
```

The Cursor `stop` hook in `.cursor/hooks.json` runs `node .harness/scripts/verify-on-stop.mjs` before the agent session ends. That script runs `node .harness/scripts/check-invariants.mjs` and, on FAIL, submits the error as the next user message. `scripts/install-into.sh --runtime=cursor` installs the hook and keeps an existing `hooks.json` entry for `verify-on-stop.mjs`.

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

    ./scripts/install-into.sh /path/to/repo --modules=web-ui

Or use scripts/enable-module.sh from this kit. The module sources stay under
the kit repository and selected skills or agents are copied into the project.
