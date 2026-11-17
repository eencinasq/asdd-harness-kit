# ui-insights — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/src/harness/ui-server-insights.mjs` (new) | Read-only insight models: `activationInsights(root, {window})` over the telemetry tail (`readTail`) and the installed steering/skills; `summarizeSkillEval(suite)`; `createSkillEvalRunner({root})` (async `execFile` of `asdd skill-eval --json`, no shell, timeout, in-memory cache); `costInsights(metrics)` (reads `metrics.cost`, tolerates its absence) |
| `cli/src/harness/ui-server.mjs` | GET `/api/insights/activation?window=7|30|90|all`, `/api/insights/skill-eval?refresh=1&baseline=<ref>`, `/api/insights/cost`; `opts.skillEvalRunner` for tests |
| `cli/src/harness/ui/app.js`, `styles.css` | New **Insights** tab (activation, skill-eval, cost sections); Slices tab gets metric cards from `/api/status` |
| `cli/src/harness/ui-server.test.mjs` | Tests with temp roots (spans, steering, skills, project.json) and a fake skill-eval runner |

## Data sources

- Activation: `.harness/state/telemetry/spans.jsonl` tail (bounded: `TAIL_MAX_LINES`/`TAIL_MAX_BYTES`), records `kind: tool` with `attributes.target_path` (written by `asdd observe`), filtered by `start_time_iso` within the window. Installed: `.harness/steering/*.md` (with `inclusion` from frontmatter) and `.agents/skills/*/SKILL.md`. Runtime columns from `project.json` `runtimes`: `claude` measured when `.claude/settings.json` wires `observe`; `cursor` not measured (hookless, telemetry D-3); others unknown.
- Skill-eval: `asdd skill-eval --json` run by the server on demand (GET triggers a run only when nothing is cached or `refresh=1`); `baseline` must match a safe ref pattern (no leading `-`).
- Cost: `computePipelineMetrics(...).cost` (contract owned by slice cost-metrics). Missing → absent.

## Missing data (REQ-004)

Each model carries `source: present | absent | error` and, when not present, a `hint` naming the command that produces the data (`asdd observe` through the Claude PostToolUse hook / `asdd skill-eval` / `asdd status --metrics`).

## New domain terms

None.

## ADRs

None: read-only views over existing outputs; the only spawned process is the existing `asdd skill-eval` CLI, argv-only.
