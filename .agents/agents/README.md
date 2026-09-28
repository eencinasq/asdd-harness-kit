# ASDD Cursor subagents

Project subagents for the **ASDD** pipeline. **Content (role, responsibilities, inputs, outputs, gates) matches** [`.agents/agents/asdd-*.md`](../../.agents/agents/) — Cursor files add only a **runtime adapter** (`Read` skills, `Write`/`StrReplace`, Task handoffs, Codegraph MCP). Both runtimes use SoT under [`.harness/`](../../.harness/) and **must write** the **per-slice** [`.harness/state/slices/<slice-id>/manifest.json`](../../.harness/state/slices/) and sync the matching row in the global [`.harness/state/manifest.json`](../../.harness/state/manifest.json) index per [`.harness/steering/manifest.md`](../../.harness/steering/manifest.md).

## Pipeline

```
Discovery → Spec → Validation → Domain → Design → Task planning → Implementation → QA → Refactor → Knowledge
                                                                    ↓
                                              Integration (Bruno) + E2E (Playwright)
```

## Invoke

Ask the parent agent to delegate, or reference by name, e.g. `@asdd-spec-agent` with the spec folder (`.harness/specs/<name>/`).

## Project steering

**Parent and every subagent** must **`Read`** files under [`.harness/steering/`](../../.harness/steering/) directly (SoT). Parent chat also loads [`.cursor/rules/asdd-steering.mdc`](../rules/asdd-steering.mdc) (`alwaysApply`). Index: [steering README](../../.harness/steering/README.md), [skills index](../../.harness/steering/skills.md).

## Kiro → Cursor behavior

| Kiro | Cursor subagent |
|------|-----------------|
| Same ASDD body (responsibilities / tasks) | Same body + **Cursor runtime** section at top |
| `.harness/steering/` via explicit Read in agent prompts | **`Read` explicit files** (see Cursor runtime + Project skills) |
| Skills | **`Read`** [`.agents/skills/<name>/SKILL.md`](../skills/) |
| Auto-chained hooks after `agentStop` | **`.cursor/hooks.json`** `subagentStop` → next `@asdd-*` via Task (see [hooks README](../hooks/README.md)) |
| Per-slice manifest / heartbeats | **Write** `.harness/state/slices/<id>/manifest.json` + sync global registry row every run — see `manifest.md` |
| Context-fresh sub-agents | `Task` tool for parallel waves |
| `fsWrite` | `Write` / `StrReplace` |
| Code exploration | **Mandatory** Codegraph MCP — `.harness/steering/codegraph.md` + `.harness/steering/codegraph-agents.md` |

Source of truth for role text: `.agents/agents/asdd-*.md`. Runtime folders (`.cursor/agents`, `.kiro/agents`, …) are hardlinks/symlinks to the same files — edit under `.agents/agents/` once.

Optional stack modules (Bruno, Playwright, web-UI): [`.agents/modules/README.md`](../modules/README.md). Portability: [`docs/asdd-harness-portability.md`](../../docs/asdd-harness-portability.md).

## Other runtimes

| Runtime | Adapter |
|---------|---------|
| Junie | `.junie/agents/*` → symlinks to this folder |
| Codex | `.codex/agents/*.toml` + `.codex/config.toml` (wrappers; body stays here) |
| OpenCode | `.opencode/agents/*.md` + `opencode.json` (wrappers; body stays here) |

Skills remain under `.agents/skills/` for all runtimes.

| Kimi | `.kimi-code/agents` → symlink here (also native `.agents/agents` discovery) |
| Devin | `.devin/agents/*` → symlinks here |
| Claude Code | `.claude/agents/*` → symlinks here |
