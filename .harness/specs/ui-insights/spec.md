# ui-insights — Spec (lite)

## Intent

Make the measurement slices visible: activation (which steering/skills are loaded vs. installed), skill-eval results
and regressions, and cost per slice/model in `asdd ui` (P5 roadmap, gaps G15–G17). A UI is only worth more than the
existing HTML when it shows data the CLI scatters.

Mapped: `cli/src/harness/ui/**`, `cli/src/harness/ui-server*.mjs`

## Requirements

- **REQ-001.** The UI shall show, per steering file and skill, installed vs. loaded counts over a selectable window, flagging never-loaded items.
- **REQ-002.** The UI shall show the latest `skill-eval` results per skill with regressions highlighted.
- **REQ-003.** The UI shall show cost and tokens per slice, phase, model, and runtime from `status --metrics --json`.
- **REQ-004.** WHERE a data source is absent (no spans, no evals), the panel shall say so and name the command that produces it.

## Depends on

`telemetry-emitters`, `skill-eval`, `cost-metrics`, `asdd-ui`.
