# Agent Runtime Template

> This file contains the **portable runtime contract** shared by all ASDD agents.
> Every agent definition should reference this file instead of duplicating these rules.

## Agent runtime (mandatory)

This file is the **same ASDD role as** the corresponding `.agents/agents/asdd-*-agent.md` file (responsibilities, inputs, outputs, gates). Adapt only the runtime:

1. **Steering (JIT loading):**
   - Each steering file under `.harness/steering/` has YAML frontmatter with `inclusion` and `tags`.
   - Load all `inclusion: "always"` files every session.
   - Load `inclusion: "auto"` files **only when their tags match the current context** (e.g., `quality-gates.md` for validation/qa/implementation, `domain-layer.md` for discovery/domain). The match keys are: the slice `phase` (`discovery`, `spec`, `validation`, `domain`, `design`, `task_planning`, `implementation`, `qa`, `refactor`, `knowledge`), the slice `mode` (`lite`), and the active role (`review`, `ui`).
   - Skip auto files whose tags do not intersect those keys — this saves context window. An explicit `Read` instruction in an agent file always applies, whatever the tags.
   - Bindings (`.project.md` files) follow the same tag rules.
   - Do not use `.kiro/steering`.
2. **Skills:** Read `.harness/steering/skills.md` (name and description only). `Read` `.agents/skills/<name>/SKILL.md` only when you start the task that matches that description. Do not read that body, its `references/`, or its `agents/` before the task starts. Skip a skill whose folder is absent. List skill bodies you loaded in the final message.
3. **Edits:** Use the runtime's file-write, file-edit, and shell tools (e.g. Cursor `Write` / `StrReplace` / `Shell`, Claude Code `Write` / `Edit` / `Bash`, Kiro `fsWrite`).
4. **Codegraph:** Use the `codegraph` MCP server through the runtime's MCP tools. Primary tool: `codegraph_explore`. Read `.harness/steering/codegraph.md` + `.harness/steering/codegraph-agents.md`. List tools used in the final message.
5. **Knowledge:** Use the `knowledge` MCP (`knowledge_search`, `knowledge_trace`, `knowledge_slice`, `knowledge_status`) for process memory — prior specs, REQs, features, sessions, failure logs. Read `.harness/steering/knowledge.md` for per-role usage. If `knowledge_status` reports no index, run `node .harness/scripts/sync-knowledge.mjs` once.
6. **State (v3.0 session logs):**
   - Read generated `.harness/state/registry.json` at start to see squad state.
   - Read generated `.harness/state/slices/<slice-id>/manifest.json` for the target slice.
   - At the end of every significant action (phase complete, feature start, dissent, override), **write a session file** to `.harness/state/slices/<slice-id>/sessions/`. Session files are append-only — never edit an existing session.
   - After writing sessions, run `node .harness/scripts/sync-state.mjs --slice <slice-id>` to regenerate the manifest and registry.
   - For implementation, also update features per `.harness/steering/session-loop.md`.
   - Gates are PASS / WARN / BLOCK per phase (`quality-gates.md`). Check the preceding phase gate before starting (`QG-DEC-09`). Confidence scores stay per phase in session `evidence`; never combine them across phases (`QG-DEC-10`). No lock files.
7. **Handoff:** Do not assume the next agent auto-runs. End with an explicit `@asdd-*-agent` recommendation when ready. Pipeline hooks may chain via the runtime's subagent tool.
8. **Parallel work:** Use the runtime's subagent tool for context-fresh sub-agents / waves (e.g. Cursor and Claude Code `Task`, Kiro `invokeSubAgent`).
9. **Model:** Each agent frontmatter declares `model: inherit` — the agent runs on the model of the runtime session (parent agent) that invokes it. `.harness/config/models.json` records each agent's tier (`tier-s` … `tier-c`) as guidance for choosing that session model; it binds no model. To run an agent on a different tier permanently, log a Dissent Notice in the slice session.
