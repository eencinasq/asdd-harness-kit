# semgrep-union — Intent

Make the Semgrep architecture/standards scan dynamic: project rules and rules derived from the specs run together,
and every rule set under `.semgrep/` runs (not only `architecture/`).

- `cli/src/harness/semgrep-lib.mjs` — `resolveSemgrepConfig` unions the selected config (binding, `.semgrep.yml`,
  or the `.semgrep/` folder) with YAML generated from `Paths | Must not import` tables; `runSemgrepScan` passes one
  `--config` per source. The `.semgrep/` folder replaces `.semgrep/architecture` as the folder candidate.
- `cli/src/harness/init-flow.mjs` — stop importing `../install/phases.mjs` (Harness depends on nothing outside
  itself; it is vendored into `tools/*/src/harness`): read the `project_id` install wrote. Fix the `<!--` regex
  token Semgrep cannot parse.
- `tools/spec-drift/src/audit/audit.service.ts` — `activeSlices` reads `registry.json` (fallback: slice dirs),
  not the retired global `manifest.json` (RV1-AR-1).

Not in scope: generating import bans from the `Dependency layers` table — spec-drift's DependencyAnalyzer already
enforces it from the import graph; Semgrep rules would duplicate those findings.
