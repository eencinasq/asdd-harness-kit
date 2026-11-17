# cost-metrics — Capability (backfilled on escalation from lite)

**Capability:** The pipeline metrics report token usage and cost per slice, phase, model, and runtime, without ever
estimating what a runtime does not expose.

- **Actors:** Tech Lead and kit maintainer comparing configurations; `ui-insights` consuming `metrics.cost`.
- **Outcome:** `asdd status --metrics` (text, `--json`, `--html`), the `asdd ui` Pipeline view, and the knowledge
  `pipeline_status` tool show the same `metrics.cost`, built from Claude Code Stop usage snapshots; USD only from the
  project's price table; runtimes without a token source listed as unknown.
- **Out of scope:** Cursor/Devin/other runtime token capture (no hook source); shipped model prices; telemetry schema
  changes.
- **Escalation:** E1 only (cli/ + package.json + the vendored tools/knowledge copy); no new domain terms, no dissent.
