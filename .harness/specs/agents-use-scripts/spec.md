# agents-use-scripts — Spec (lite)

## Intent

Agents and skills shall do their work with the harness scripts (`.harness/scripts/*.mjs`), not the MCP servers. The
`spec-drift`, `jev-gate`, and `knowledge` servers stay for people in chat and project the same logic: they vendor the
scripts the agents run, so both give the same answers. Where a script had no CLI for what an agent needs (knowledge
queries, the Jev gates), this slice adds it.

## Requirements

- **REQ-001.** `node .harness/scripts/knowledge-query.mjs` shall answer `status`, `search`, `trace`, `slice`, and `patterns` as JSON, and exit 1 when there is no index or the arguments are invalid.
- **REQ-002.** `node .harness/scripts/jev-gates.mjs` shall run `status`, `shape-up`, `scope-choice`, and `ears`, print the verdict as JSON, and exit 1 when a gate fails or Jev is unavailable.
- **REQ-003.** The `knowledge` and `jev-gate` servers shall answer from the vendored `knowledge-query.mjs` and `jev-gates.mjs`, so the CLI and the tools return the same payloads.
- **REQ-004.** Agent files, skills, `AGENTS.md`, the Cursor rule, and steering shall direct agents to the scripts; no agent or skill shall require a `knowledge_*`, `jev_*`, or `audit_*` MCP tool.
- **REQ-005.** The installer shall ship `.harness/scripts/knowledge-query.mjs`.
