# Capability: Typed results, read-only learning view, and server-side audit query (spec-drift-apps)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc
- Scope ID: none
- Scope class: must_have

## Problem Statement
The Tech Lead uses the `spec-drift` MCP server from chat hosts. Its 11 audit and analysis tools return untyped
`structuredContent`, so a client cannot know a result's shape; the audit view routes a dismissal through the model; the
self-improving loop (patterns, proposals) is visible only as text in `audit_diff`; and summarizing many findings costs one
page of findings per call in the model's context.

## Business Context
Measured on a small sandbox PR, a review loop already sends ~27 KB of text plus 13.7 KB of tool definitions per turn;
typed, aggregated results reduce that, and are the precondition for code-mode hosts.

## Actors
- Tech Lead: triages findings and decides proposals, in chat and through the `asdd` CLI.
- Chat host: renders MCP App views, or reads JSON (and, in code-mode hosts, generated types).
- spec-drift server: reads the repository through the vendored harness libraries; writes nothing to it.

## Domain Entities Involved
- Finding (`AUD-*`), triage entry, learning pattern (`LP-*`), steering proposal (`SP-*`).

## Functional Scope (Behaviors)
- Every audit and analysis tool declares an `outputSchema` that its real results satisfy.
- `learning_report` lists patterns and proposals with the fields each proposal still lacks and the next command.
- The audit view shows `asdd triage <id> --dismiss|--confirm …` to copy; it no longer asks the model to triage.
- `audit_query` filters findings (slice, severity, check, source, path prefix) and groups them (slice, severity, check,
  path, none), returning counts and a bounded sample.

## Out of Scope
Server writes; Code Mode hosting; PR-review schemas.

## Non-Functional Requirements
### Performance
`audit_query` returns at most `limit` findings (default 20) plus counts.
### Security
No new write path; the triage decision stays with a human at the CLI.

## Success Metrics
`tools/list` shows `outputSchema` on 12 tools (11 + `audit_query`) plus `learning_report`; e2e results validate.

## Open Questions
None.

## Confidence Score
0.85
