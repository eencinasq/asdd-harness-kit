# Requirements: spec-drift-adoption

## Traceability
- Capability: [capability.md](./capability.md)
- Intent: [intent.md](./intent.md)

## EARS Requirements

### REQ-001 — Baseline (P1)
**State-driven:** While `.semgrep/baseline.json` exists in the analyzed repository, every analysis result shall mark each
finding `new` or `existing` (matched by fingerprint: rule, path, and the normalized text of its line, counted with
multiplicity) and report new, existing, and — for a whole-repository scan — resolved counts; and `spec-drift baseline
--write` (a command a person runs, not an MCP tool) shall write that file from a fresh scan, while `spec-drift baseline`
without `--write` only reports what it would record.

### REQ-002 — Trend (P1)
**Event-driven:** When `spec-drift record` runs, it shall write a snapshot of a whole-repository analysis to
`.semgrep/history/<date>.json` (one per day, the last run of the day wins); when `drift_trend` runs, the server shall
return, oldest first, the points of the analysis snapshots or of the `.harness/audits/` reports, the change of each rule /
ADR / pack (analysis) or check / slice (audit) between the first and the last point, and a direction (better, worse,
flat), writing nothing; the analysis dashboard shall chart the analysis points.

### REQ-003 — Toolsets (P2)
**State-driven:** While `SPEC_DRIFT_TOOLSETS` lists toolsets (`analysis`, `review`, `audit`; default all three), the
server shall list only the tools, prompts, and resources of those toolsets; an unknown name shall stop the server with an
error naming the valid ones.

### REQ-004 — Install without editing paths (P2)
**Event-driven:** When `spec-drift config --client <cursor|claude-code|claude-desktop>` runs (optionally with
`--project <dir>`), it shall print a ready-to-use configuration (the resolved launcher path, Node and tool directories on
`PATH`, and the project roots) for that client; the README shall give a 5-minute install from a kit checkout and use one
product name, `spec-drift`.

## Acceptance Criteria

| ID | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | REQ-001 | Unit: fingerprints ignore line moves and whitespace; multiplicity; new/existing/resolved. E2E (Semgrep): after `baseline --write`, a rescan shows 0 new; a new violation shows 1 new; the MCP server writes nothing. |
| AC-002 | REQ-002 | Unit: trend points, per-key change, direction. E2E: `record` writes one file per day; `drift_trend` over 2 snapshots and over audit reports; schema-valid. |
| AC-003 | REQ-003 | E2E: with `review`, only `pr_review_*` tools and review prompts are listed; with an unknown name, the config fails naming the valid set. |
| AC-004 | REQ-004 | Unit: each client's config holds absolute launcher and node paths, PATH dirs, and `--project` roots; `spec-drift config` prints it without starting a server. |
