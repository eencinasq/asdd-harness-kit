# Runtime adapters

IDE folders (`.cursor`, `.claude`, `.kiro`, …) are **not** the SoT: `.agents/` and `.harness/` are. `asdd install <dir> --runtime=<names>` wires each runtime. Claude Code, Cursor, and OpenCode get agent files **rendered** from each agent's `capabilities` (their tool envelope); the other runtimes get links. Edit `.agents/agents/`, then re-run the installer; a rendered file you edit is kept (SKIP) until `--force`.

## Cursor

The installer links `.cursor/skills` and `.cursor/mcp.json` to `.agents/`, copies `cli/runtimes/cursor/asdd-steering.mdc` to
`.cursor/rules/`, and renders `.cursor/agents/asdd-*.md` (`readonly: true` for agents that write nothing).

The Cursor `stop` hook in `.cursor/hooks.json` runs `asdd verify` before the agent session ends. That script runs `asdd check` and, on FAIL, submits the error as the next user message. `asdd install <dir> --runtime=cursor` installs the hooks and keeps an existing `hooks.json` entry for verify. Projects get no copy of the CLI: each hook runs a short POSIX line that uses the project's `node_modules/.bin/asdd` (a devDependency), else `asdd` on the PATH (a global install), and fails closed with how to install it when neither exists. Native Windows shells are not supported for the hooks (WSL and Git Bash are).

## Claude Code

The installer links `.claude/skills` and `.mcp.json` to `.agents/`, creates `CLAUDE.md` pointing at `AGENTS.md`, adds the
Stop and PreToolUse hooks to `.claude/settings.json`, and renders `.claude/agents/asdd-*.md` with `tools` (or
`disallowedTools` for agents that need MCP tools) and `maxTurns`.

## OpenCode

The installer renders `.opencode/agents/asdd-*.md` (`permissions` for edits and sub-agents, `steps`), links
`.opencode/skills`, and maintains the project-level `opencode.json` MCP projection.

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
