# ASDD subagents

Project subagents for the **ASDD** pipeline. `.agents/agents/asdd-*.md` is the single source for every role (responsibilities, inputs, outputs, gates). Runtime folders link to these files; the portable runtime contract is [`_runtime-template.md`](_runtime-template.md).

All agents use SoT under [`.harness/`](../../.harness/). They write session files to `.harness/state/slices/<slice-id>/sessions/` and run `asdd sync`, which generates the per-slice `manifest.json` and the global `.harness/state/registry.json` — see [`manifest.md`](../../.harness/steering/manifest.md). Agents never hand-edit generated files.

## Pipeline

```
Discovery → Spec → Validation → Domain → Design → Task planning → Implementation → QA → Refactor → Knowledge
                                                                    ↓                         ↑
                                              Integration (Bruno) + E2E (Playwright)    Spike researcher (on low confidence)
```

Roles: one per agent (`metadata.tier`). QA audits only; tests come from Implementation's TDD step; requirements are
reviewed by Validation; spikes are read-only research by `asdd-spike-researcher`. Rendered runtime files and the
capability schema: [`_runtime-template.md`](_runtime-template.md).

Small work (≤3 files, ≤1 new domain concept): `asdd-lite-agent` — see [`asdd-lite.md`](../../.harness/steering/asdd-lite.md).

## Invoke

Ask the parent agent to delegate, or reference by name, e.g. `@asdd-spec-agent` with the spec folder (`.harness/specs/<name>/`).

## Project steering

**Parent and every subagent** must **`Read`** files under [`.harness/steering/`](../../.harness/steering/) directly (SoT), with JIT loading per [`_runtime-template.md`](_runtime-template.md). Index: [steering README](../../.harness/steering/README.md), [skills index](../../.harness/steering/skills.md). On Cursor, the parent chat also loads `.cursor/rules/asdd-steering.mdc` (`alwaysApply`), installed from the kit's `cli/runtimes/cursor/asdd-steering.mdc`.

## Runtime adapters

| Concern | Contract |
|---------|----------|
| Role body | Same file for every runtime; edit under `.agents/agents/` once |
| Steering | Explicit `Read` of `.harness/steering/` (never `.kiro/steering`) |
| Skills | Read [`skills.md`](../../.harness/steering/skills.md) (name and description). `Read` [`.agents/skills/<name>/SKILL.md`](../skills/) only when that task starts |
| Verify-on-Stop | Cursor: `.cursor/hooks.json` `stop`; Claude Code: `.claude/settings.json` `Stop` → `asdd verify`. FAIL output from `asdd check` is the next prompt |
| State | Session file + `asdd sync` after every significant action — see `manifest.md` |
| Context-fresh sub-agents | The runtime's task/subagent tool for parallel waves |
| Code exploration | **Mandatory** the [`codegraph`](../skills/codegraph/SKILL.md) skill (`codegraph explore …`, the codegraph CLI) |

Optional stack modules (Bruno, Playwright, web-UI, HTTP API): [`modules/README.md`](https://github.com/eencinasq/asdd-harness-kit/tree/main/cli/modules) in the kit. The installer copies enabled module agents into this folder. Portability: [README → Adopter checklist](https://github.com/eencinasq/asdd-harness-kit#adopter-checklist).

## Runtimes

| Runtime | Adapter |
|---------|---------|
| Cursor | `.cursor/agents/*` → rendered from here (`readonly` from capabilities) |
| Claude Code | `.claude/agents/*` → rendered from here (`tools` / `disallowedTools`, `maxTurns`) |
| Junie | `.junie/agents/*` → symlinks here |
| Devin | `.devin/agents/*` → symlinks here |
| Kimi | `.kimi-code/agents` → symlink here (also native `.agents/agents` discovery) |
| OpenCode | `.opencode/agents/*` → rendered from here (`permissions`, `steps`); `opencode.json` loads `AGENTS.md` |
| Kiro | `.kiro/agents/*` → symlinks here |
| Codex | No agent adapter; MCP projection only (`.agents/mcp/mcp.codex.toml`) |

Skills remain under `.agents/skills/` for all runtimes.
