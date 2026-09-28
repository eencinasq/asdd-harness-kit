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

## Other IDEs

Same pattern: agents → `.agents/agents`, skills → `.agents/skills`, MCP → `.agents/mcp/mcp.json` (or projected TOML for Codex — use `node .agents/mcp/sync-runtime-mcp.cjs` after adding projection configs from a product repo).

## Enabling modules

Copy module agent/skill into `.agents/agents` / `.agents/skills`, then re-run the symlink loops above. See [`.agents/modules/README.md`](../.agents/modules/README.md).
