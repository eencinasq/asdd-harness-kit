# Intent: spec-drift-depth

## Source

- **Pitch ID:** ad-hoc — `tools/spec-drift/docs/ROADMAP.md` priority **P3** (P3.1 traceability matrix, P3.2 PR risk,
  P3.3 dependency-graph rules, P3.4 MCP Tasks and elicitation)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-13: "go ahead with the P3 in another slice")

## Problem

An auditor asks "which requirement does this code implement, which test proves it, which PR brought it" and the answer
is spread over specs, feature files, sessions, and git history. A PR review treats every changed file the same, although
the audit already knows which files churn, carry requirements, and break rules. Semgrep matches import strings, so it
cannot resolve relative imports to a layer and cannot see cycles at all. A full analysis can take minutes inside one
tool call, and the review asks for confirmation and for the ticket in free text, where a structured question would do.

## Desired Outcome

A Tech Lead reads one REQ → feature → file → test → PR matrix with its gaps; a PR review starts with the riskiest files;
the layer table in `domain-layer.project.md` becomes dependency rules (layers and cycles) next to the Semgrep rules; a
long analysis runs in the background while the host polls; the review confirms publishing and asks for the ticket with
MCP elicitation when the host supports it.

## Must-have outcomes

- MH-01 Traceability: `traceability_matrix` over the kit's knowledge index, per requirement, with gaps; an audit
  dashboard tab; "no data" without an index.
- MH-02 PR risk: per changed file, churn × requirement links × findings (the audit formula), ranked, in the review start
  result, the review prompt, and the dashboard.
- MH-03 Dependency rules: a `Dependency layers` table becomes `dep-layer` and `dep-cycle` rules, run by a dependency-graph
  engine behind the `CodeAnalyzer` port together with Semgrep.
- MH-04 Long runs and questions: `analysis_start` runs a scan in the background and `analysis_job` polls the result; publish
  and the ticket use elicitation (MCP `inputRequired`) when the client declares it, and behave as today otherwise.

## Mapped files

`tools/spec-drift/src/**`, `tools/spec-drift/ui/**`, `tools/spec-drift/test/**`, `tools/spec-drift/README.md`,
`tools/spec-drift/docs/**`, `cli/templates/bindings/domain-layer.project.md`

## No-gos

The MCP server process writes no repository file; no package publishing; no change to the kit's `asdd audit` or
`asdd check` logic; MCP Tasks (`tasks/*`) are not used — protocol revision 2026-07-28, which the SDK in use speaks,
removed them (see design ADR-004).
