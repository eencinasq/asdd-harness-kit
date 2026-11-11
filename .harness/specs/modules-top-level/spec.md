# modules-top-level — Spec (lite)

## Intent

The kit's optional modules move from `.agents/modules/` to a top-level `modules/`, a sibling of `tools/`. Modules are
kit sources: the installer copies an enabled module's agents, skills, adapters, and MCP entry into the project, and
still removes a legacy `.agents/modules` there. Nothing changes for adopters.

## Requirements

- **REQ-001.** The installer shall copy module files from the kit's `modules/<module>/` for `--modules=<m>`, and shall still remove a legacy `.agents/modules` from the target.
- **REQ-002.** `versions.json` shall record module files under `modules/`, and the npm package shall include `modules/**`.
- **REQ-003.** In the kit repo, the `spec-drift` server shall load spec-compliance adapters of enabled modules from `modules/<module>/adapters`.
- **REQ-004.** Tests, CI, and docs shall reference `modules/` instead of `.agents/modules/`.
