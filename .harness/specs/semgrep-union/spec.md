# semgrep-union — Spec (lite)

## Requirements

- **REQ-001.** When project Semgrep rules are selected and the specs hold `Paths | Must not import` rows with a
  scannable `Language`, the architecture scan shall run both the selected rules and the generated rules.
- **REQ-002.** When a `.semgrep/` folder holds rule files, the architecture scan shall select the whole folder, so
  every rule set in it runs.
- **REQ-003.** Harness libraries shall not import modules outside `cli/src/harness` (`init-flow.mjs`).
- **REQ-004.** The spec-drift audit service shall list slices from `.harness/state/registry.json`, falling back to
  `.harness/state/slices/<id>/` directories, and shall not read `.harness/state/manifest.json`.
- **REQ-005.** The analysis dashboard shall title the scan by its mode and offer a "Generate rules" action for the
  mode's rule set; when the set already has rules, the generated prompt shall keep them running, add only missing
  rules, and re-run the same analyze tool.
- **REQ-006.** The repo's `.semgrep/` rule sets shall report no false positives on this codebase and shall cover the
  harness's real untrusted inputs (hook stdin, PR metadata) and the files vendored into the MCP servers.
