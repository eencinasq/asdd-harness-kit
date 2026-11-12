# Intent: spec-drift-apps

## Source

- **Pitch ID:** ad-hoc (kit maintenance)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request: "implement points 1 to 3"; point 2 kept read-only)

## Problem

The `spec-drift` MCP server returns `structuredContent` without declaring `outputSchema`, so clients (and code-mode
hosts) cannot type its results; the audit view's "dismiss" asks the model to run the triage; the learning loop has no
view; and aggregating audit findings means paging every finding into the model's context.

## Desired Outcome

Typed tool results, a read-only learning view with the exact commands a human runs, and a server-side query that returns
grouped counts instead of pages of findings — with the server still writing nothing to the repository.

## Must-have outcomes

- MH-01 `outputSchema` on the audit and analysis tools; every real result validates.
- MH-02 A read-only `learning_report` tool and view panel (patterns, proposals, what each proposal still needs, the next
  command); triage actions in the view show the `asdd triage` command instead of messaging the model; proposal
  validation shared by the CLI and the server.
- MH-03 A read-only `audit_query` tool: filter and group findings server-side.

## No-gos

The server writes no repository file (no triage, no proposal edits); Code Mode host integration; PR-review tool schemas.
