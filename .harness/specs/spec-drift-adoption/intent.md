# Intent: spec-drift-adoption

## Source

- **Pitch ID:** ad-hoc — `tools/spec-drift/docs/ROADMAP.md` priority **P2** (P2.1 baseline, P2.2 trend, P2.3 toolsets,
  P2.4 identity and install guide)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request, 2026-11-12: "go with P2 in another slice"; distribution: **guide only** —
  no new package, no publishing)

## Problem

On a legacy repository the first analysis shows every existing violation, so the dashboard is noise and nobody can tell
what a change introduced. Nothing keeps the analysis over time, so "is drift going down?" has no answer. All 34 tools
load in every client, even when a team uses one of the three jobs. Installing the server means a kit checkout, a build,
and hand-written absolute paths in each client's config, under a name that changes between "Architecture MCP" and
"spec-drift".

## Desired Outcome

A Tech Lead freezes existing violations in a committed baseline and the analysis shows what is new; a recorded history
answers whether drift goes up or down; a team loads only the toolsets it uses; a teammate installs the server from a kit
checkout by pasting a generated config — one product name, `spec-drift`.

## Must-have outcomes

- MH-01 Baseline: line-stable fingerprints, `.semgrep/baseline.json` written by `spec-drift baseline --write` (a human
  command), and new / existing / resolved in every scan and the dashboard.
- MH-02 Trend: `spec-drift record` snapshots into `.semgrep/history/`; `drift_trend` over analysis snapshots and
  `.harness/audits/` reports; a trend chart in the analysis dashboard.
- MH-03 Toolsets: `SPEC_DRIFT_TOOLSETS` limits the tools, prompts, and views to `analysis`, `review`, `audit`.
- MH-04 Install: `spec-drift config --client …` prints the client config with resolved paths; a 5-minute guide; one name.

## Mapped files

`tools/spec-drift/src/**`, `tools/spec-drift/bin/spec-drift.mjs`, `tools/spec-drift/ui/analysis-dashboard/**`,
`tools/spec-drift/ui/analysis-dashboard.html`, `tools/spec-drift/test/**`, `tools/spec-drift/README.md`,
`tools/spec-drift/docs/**`, `tools/spec-drift/package.json`, `cli/mcp/README.md`

## No-gos

The MCP server process writes no repository file (baseline and history are written by the `spec-drift` CLI commands a
person or CI runs); no package publishing or registry change; no change to the kit's audit (`asdd audit` already keeps
dated reports).
