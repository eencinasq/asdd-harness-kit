# Shared MCP (kit baseline)

**Canonical for the kit repo:** [`mcp.json`](mcp.json) — knowledge (`tools/knowledge`) and spec-drift (`tools/spec-drift`). Both NestJS servers are built once with `pnpm install && pnpm build` in their folder (Node ≥ 24.22.1)., plus `jev-gate` (`tools/jev-gate`): System One gates for people in chat, not part of the harness or the ASDD pipeline.

**Projects:** `asdd install` does **not** copy `tools/*` and seeds an empty `.agents/mcp/mcp.json`. Agents and skills run the same logic with the CLI (`asdd knowledge …`, `asdd drift`, `asdd audit`) and do not depend on MCP servers. Optional chat MCP stays in a kit checkout: for spec-drift, `node tools/spec-drift/bin/spec-drift.mjs config --client <cursor|claude-code|claude-desktop>` prints the client config with the paths resolved (see [its README](../../tools/spec-drift/README.md#install-in-5-minutes)).

The kit's `jev-gate` MCP server ([`tools/jev-gate/`](../../tools/jev-gate/README.md); `node tools/jev-gate/bin/jev-gate.mjs` after `pnpm install && pnpm build` there) is only for people in chat: no skill, agent, or hook calls it. It exposes:

- **System One gates:** `jev_status`, `jev_shape_up_gates`, `jev_scope_choice`, `jev_ears_gate` — a second opinion on the Shape Up / Product Delivery gates a human decides (`JEV_API_KEY`).
- **Command safety (deprecated here):** `check_command_safety` — kept for existing MCP users. Hooks call `asdd gate`.

The `spec-drift` MCP server ([`tools/spec-drift/`](../../tools/spec-drift/README.md), launched with `node tools/spec-drift/bin/spec-drift.mjs`) carries the read-only governance view as its `audit` module. Every check is the logic of the asdd CLI's `drift-lib.mjs`, `semgrep-lib.mjs`, `audit-lib.mjs`, and `learning-lib.mjs`, vendored into the server (`tools/spec-drift/src/harness/`), so chat, Verify-on-Stop, and CI give the same answer; the server reads only the data of the repo at `HARNESS_ROOT` (default: the working directory):

- **Tools:** `audit_diff` (mode `author` for engineers, `review` for the Tech Lead), `verify_architecture_rules`, `verify_spec_compliance` (the `ears` adapter plus enabled module adapters), `generate_ci_gate`, `audit_report`, `audit_finding`, `audit_query`, `learning_report`, `traceability_matrix` (REQ → feature → file → test → PR, with gaps). Results stay under 8 KB so Cursor renders them inline; the dashboard (and the model) loads the rest by calling the same tool with `page_token`, and source texts with `verify_architecture_rules { source }` (or `include_text: true`).
- **Learning:** `audit_diff` results carry a `learning` block — open patterns from the self-improving harness, marked `relevant` when they are about a changed area or a linked slice; `pr-review` turns relevant ones into advisory comments.
- **Resources:** `spec://manifest`, `spec://rules/architecture`, `spec://drift/latest-report`.
- **Prompts:** `architecture-review`, `spec-alignment`, `pr-review`.
- **Beyond the audit** (same server, other toolsets): rule analysis (Semgrep or CodeQL, dependency-graph rules, baseline, trend, drift origin, guided fixes, background scans, multi-repo overview) and GitHub PR review (pending reviews, risk ranking, ticket criteria, cost metrics, a CI workflow). `SPEC_DRIFT_TOOLSETS=audit` loads only the audit tools. Full list: [its README](../../tools/spec-drift/README.md).
- **MCP App:** the audit tools link the `ui://spec-drift/audit-dashboard.html` view (source `tools/spec-drift/ui/audit-dashboard/`, built by `pnpm build`). Its buttons only send chat messages: "Send to agent as task" for engineers, "Draft comment" and "Dismiss…" for the Tech Lead. Every result still carries the full JSON as text. In Cursor, widgets from servers registered in a project's `.cursor/mcp.json` may not render (known issue); register the server in `~/.cursor/mcp.json` to see the view, with an absolute path and the project root:

```json
"spec-drift": {
  "command": "node",
  "args": ["/abs/path/to/kit/tools/spec-drift/bin/spec-drift.mjs"],
  "env": { "HARNESS_ROOT": "/abs/path/to/project" }
}
```

Design: [README → spec drift and audit](https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit). Older installs that copied `tools/` into the project are cleaned on the next `asdd install` (the tree and the `tools/*` MCP entries go).

The `knowledge` MCP server ([`tools/knowledge/`](../../tools/knowledge/README.md), launched with `node tools/knowledge/bin/knowledge.mjs`) serves process memory: `knowledge_search`, `knowledge_trace`, `knowledge_slice`, and `knowledge_status` over the generated index, plus `knowledge_patterns` for the learning loop (patterns, proposals, and the failure-log signatures in use — computed live, no index needed). See `.harness/steering/knowledge.md`.

These servers are for people in chat in a kit checkout. Agents and skills run the same logic with the `asdd` CLI (`asdd knowledge …`, `asdd drift`, `asdd audit`) and do not depend on them.

The servers under `tools/` are self-contained: they never load the project's harness CLI at runtime. The harness libraries they share with the CLI are copied into each `tools/<name>/src/harness/` by `asdd kit vendor` (kit only); `npm test` fails while a copy is stale.

Servers with `"enabled": false` are skipped by `sync-runtime-mcp.cjs` projections.

```bash
echo '{"command":"git status"}' | asdd gate
```
