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
5. **State (v3.0 session logs):**
   - Read generated `.harness/state/registry.json` at start to see squad state.
   - Read generated `.harness/state/slices/<slice-id>/manifest.json` for the target slice.
   - At the end of every significant action (phase complete, feature start, dissent, override), **write a session file** to `.harness/state/slices/<slice-id>/sessions/`. Session files are append-only — never edit an existing session.
   - After writing sessions, run `node .harness/scripts/sync-state.mjs --slice <slice-id>` to regenerate the manifest and registry.
   - For implementation, also update features per `.harness/steering/session-loop.md`.
   - No CCS scores. No confidence chains. No lock files. Gates are PASS / WARN / BLOCK.
6. **Handoff:** Do not assume the next agent auto-runs. End with an explicit `@asdd-*-agent` recommendation when ready. Pipeline hooks may chain via Task.
7. **Parallel work:** Prefer the `Task` tool for context-fresh sub-agents / waves (instead of Kiro `invokeSubAgent`).
8. **Model tier:** Each agent frontmatter declares `model: tier-{s|a|b|c}`. Read `.harness/config/models.json` to understand the tier rationale. If your runtime supports per-agent model selection, bind the agent to the model recommended by the runtime's `models.json`. If not, use the workspace default and accept the trade-off. Do not override a tier without a Dissent Notice logged in the slice session.
