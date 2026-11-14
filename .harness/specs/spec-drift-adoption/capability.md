# Capability: Adoptable spec-drift (spec-drift-adoption)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (ROADMAP P2)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md).

## Actors
- Tech Lead: accepts existing violations (baseline), records history, reads the trend.
- Teammate: installs the server in a client and loads only what the team uses.
- CI job: may run `spec-drift record` on a schedule.

## Entities
- Finding fingerprint: rule + path + the matched line's normalized text (stable when lines move).
- Baseline: fingerprint counts of accepted existing findings, `.semgrep/baseline.json`.
- Snapshot: one dated analysis summary (totals, per rule/ADR/pack/severity, new vs existing), `.semgrep/history/<date>.json`.
- Trend: snapshots or audit reports over time, with the direction of change.
- Toolset: `analysis`, `review`, or `audit` — the tools, prompts, and views of one job.

## Out of Scope
Publishing a package; trends of PR reviews; the kit's audit format.
