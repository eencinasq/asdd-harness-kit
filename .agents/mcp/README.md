# Shared MCP (kit baseline)

**Canonical:** [`mcp.json`](mcp.json) — codegraph, knowledge, and spec-drift-auditor (zero dependencies, no SDK required). The `jev-gate` entry is added only by the `jev` module (`.agents/modules/jev/mcp.json`).

With the `jev` module, the `jev-gate` MCP server (`.agents/mcp/jev-gate-server.mjs`) exposes:

- **Skill gates (System One):** `jev_status`, `jev_shape_up_gates`, `jev_scope_choice`, `jev_ears_gate` — for `shape-up` and `product-delivery` only.
- **Command safety (deprecated here):** `check_command_safety` — kept for existing MCP users. Use the CLI instead: hooks call `.harness/scripts/command-gate.mjs`, and runtimes without hooks run it before dangerous commands.

See `.harness/steering/jev.md`.

The `spec-drift-auditor` MCP server (`.agents/mcp/spec-drift-auditor.mjs`) is the read-only governance view. Every check lives in `.harness/scripts/drift-lib.mjs` and `audit-lib.mjs`, so chat, Verify-on-Stop, and CI give the same answer:

- **Tools:** `audit_diff` (mode `author` for engineers, `review` for the Tech Lead), `verify_architecture_rules`, `verify_spec_compliance` (the `ears` adapter plus enabled module adapters), `generate_ci_gate`, `audit_report`, `audit_finding`. With MCP Apps, results stay under 8 KB so Cursor renders them inline; the dashboard loads the rest by calling the same tool with `page_token`, and source texts with `verify_architecture_rules { source }`.
- **Learning:** `audit_diff` results carry a `learning` block — open patterns from the self-improving harness, marked `relevant` when they are about a changed area or a linked slice; `pr-review` turns relevant ones into advisory comments.
- **Resources:** `spec://manifest`, `spec://rules/architecture`, `spec://drift/latest-report`.
- **Prompts:** `architecture-review`, `spec-alignment`, `pr-review`.
- **MCP App:** when the host declares the `io.modelcontextprotocol/ui` extension, `audit_diff`, `verify_spec_compliance`, and `audit_report` link the `ui://spec-drift/dashboard` view ([`ui/drift-dashboard.html`](ui/drift-dashboard.html), built from `tools/drift-dashboard/` with `npm run build:ui` in the kit). Its buttons only send chat messages: "Send to agent as task" for engineers, "Draft comment" and "Dismiss…" for the Tech Lead. Every result still carries the full JSON as text. In Cursor, widgets from servers registered in a project's `.cursor/mcp.json` may not render (known issue); register the server in `~/.cursor/mcp.json` to see the view, with an absolute path and the project root:

```json
"spec-drift-auditor": {
  "command": "node",
  "args": ["/abs/path/to/project/.agents/mcp/spec-drift-auditor.mjs"],
  "env": { "HARNESS_ROOT": "/abs/path/to/project" }
}
```

Design: [README → spec drift and audit](https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit). The installer adds this server to an existing `mcp.json` without changing other entries.

The `knowledge` MCP server (`.agents/mcp/knowledge-server.mjs`) serves process memory: `knowledge_search`, `knowledge_trace`, `knowledge_slice`, and `knowledge_status` over the generated index, plus `knowledge_patterns` for the learning loop (patterns, proposals, and the failure-log signatures in use — computed live, no index needed). See `.harness/steering/knowledge.md`.

Servers with `"enabled": false` are skipped by `sync-runtime-mcp.cjs` projections.

```bash
node --input-type=module -e "import { checkCommandSafety } from './.harness/scripts/command-gate.mjs'; console.log(await checkCommandSafety('git status'))"
```
