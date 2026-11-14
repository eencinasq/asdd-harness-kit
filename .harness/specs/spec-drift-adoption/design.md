# Design: spec-drift-adoption

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `src/analysis/domain/baseline.ts` (new) | Fingerprints, baseline file shape, new/existing/resolved (pure) |
| `src/analysis/domain/trend.ts` (new) | Snapshot shape, trend points, per-key change, direction (pure) |
| `src/analysis/analysis.{service,types,output,presenter,tools}.ts` | Baseline status in every scan; `drift_trend`; snapshot building; trend in the summary |
| `src/cli/*.ts` (new), `src/main.ts`, `bin/spec-drift.mjs` | `baseline`, `record`, `config` commands (no MCP transport) |
| `src/config/env.schema.ts`, `src/config/toolsets.ts` (new), feature modules | `SPEC_DRIFT_TOOLSETS`: MCP entry classes registered per toolset |
| `src/audit/audit.service.ts` | Audit report points for `drift_trend` |
| `ui/analysis-dashboard/**`, `ui/analysis-dashboard.html` | New-only filter and KPI; Trend tab with an SVG line chart |
| `README.md`, `docs/PLAYBOOK.md`, `package.json` description, `cli/mcp/README.md` | One name; 5-minute install; config command |

## Domain Placement
- Owning domain: spec-drift analysis (engine-neutral domain), CLI entry, configuration.
- Integration boundaries: baseline and history live in the analyzed repo's `.semgrep/`; audit reports are read from
  `.harness/audits/`.
- Documented exceptions: none.

## Domain Impact
Terms in capability.md. No product domain change.

## Decisions
- **ADR-001 — Fingerprint by line text.** `sha256(rule \0 path \0 normalized line)`; a moved line keeps its fingerprint,
  an edited line becomes new. Duplicates on identical lines are counted, not collapsed. The PR review's fingerprint is
  per finding text, so a separate one is used here.
- **ADR-002 — People write, the server reads.** `baseline --write` and `record` are CLI commands of the package; the MCP
  tools only read the files and say which command to run. Baseline and history are meant to be committed.
- **ADR-003 — Resolved only for whole scans.** A scan limited by paths or mode cannot tell resolved from out of scope;
  resolved is null then.
- **ADR-004 — Direction.** Compare the first and the last point's total (new findings when both have a baseline): ±5 %
  or less is flat; otherwise better (down) or worse (up).
- **ADR-005 — Toolsets at module definition.** Each feature module registers its MCP entry classes (tools, prompts,
  views) only when its toolset is on; services stay, because audit and review use the analysis services. Read from the
  environment when the modules are defined, validated by the same env schema.
- **ADR-006 — Config generation, no writing.** `spec-drift config` prints JSON (or the `claude mcp add` line); the
  person pastes it. Paths come from the running launcher and `process.execPath`; PATH gets the directories of `node`,
  `semgrep`, `gh` found on the current PATH.

## Risks
- Fingerprints of a reformatted file all become new; the baseline is then re-written deliberately.
- History files grow by one small JSON per day recorded.

Design confidence 0.85.
