# semgrep-union — Spec (lite)

## Requirements

- **REQ-001.** When project Semgrep rules are selected and the specs hold `Paths | Must not import` rows with a
  scannable `Language`, the architecture scan shall run both the selected rules and the generated rules.
- **REQ-002.** When a `.semgrep/` folder holds rule files, the architecture scan shall select the whole folder, so
  every rule set in it runs.
- **REQ-003.** Harness libraries shall not import modules outside `cli/src/harness` (`init-flow.mjs`).
- **REQ-004.** The spec-drift audit service shall list slices from `.harness/state/registry.json`, falling back to
  `.harness/state/slices/<id>/` directories, and shall not read `.harness/state/manifest.json`.
