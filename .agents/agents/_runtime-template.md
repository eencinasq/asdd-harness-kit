# Agent Runtime Template

> This file contains the **portable runtime contract** shared by all ASDD agents.
> Every agent definition should reference this file instead of duplicating these rules.

## Agent runtime (mandatory)

This file is the **same ASDD role as** the corresponding `.agents/agents/asdd-*-agent.md` file (responsibilities, inputs, outputs, gates). Adapt only the runtime:

1. **Steering (JIT loading):**
   - Each steering file under `.harness/steering/` has YAML frontmatter with `inclusion` and `tags`.
   - Load all `inclusion: "always"` files every session.
   - Load `inclusion: "auto"` files **only when their tags match the current phase** (e.g., `quality-gates.md` for validation/qa/implementation, `domain-layer.md` for discovery/domain).
   - Skip auto files whose tags do not intersect the current phase — this saves context window.
   - Bindings (`.project.md` files) follow the same tag rules.
   - Do not use `.kiro/steering`.
2. **Skills:** Read `.harness/steering/skills.md` (name and description only). `Read` `.agents/skills/<name>/SKILL.md` only when you start the task that matches that description. Do not read that body, its `references/`, or its `agents/` before the task starts. Skip a skill whose folder is absent. List skill bodies you loaded in the final message.
3. **Edits:** Use `Write` / `StrReplace` / `Shell` (not Kiro `fsWrite`).
4. **Codegraph:** Use Cursor MCP (`GetDynamicTools` / `CallDynamicTool` or equivalent). Primary tool: `codegraph_explore`. Read `.harness/steering/codegraph.md` + `.harness/steering/codegraph-agents.md`. List tools used in the final message.
5. **State:** Read `.harness/PROGRESS.md` and global `.harness/state/manifest.json` (index only) at start; resolve the slice; **write** `.harness/state/slices/<slice-id>/manifest.json` at end of a completed phase and **sync that slice's registry row** in the global index per `.harness/steering/manifest.md`. Never treat the global file as the phase machine. For implementation, also update features + PROGRESS per `.harness/steering/session-loop.md`.
6. **Handoff:** Do not assume the next agent auto-runs. End with an explicit `@asdd-*-agent` recommendation when ready. Pipeline hooks may chain via Task.
7. **Parallel work:** Prefer the `Task` tool for context-fresh sub-agents / waves (instead of Kiro `invokeSubAgent`).
