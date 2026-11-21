# platform-contract — Intent

Land the Phase-2 declaration layer of the microkernel platform contract
(`@asdd/proposals/architecture/v3.md`, ratified draft):

- `cli/registry/contribution-points.json` — the 26-class artifact registry
  (class → schema → source_root → mount → generator → merge → trust), plus
  `generators` and `vocabulary` sections.
- `cli/modules/{bruno,http-api,playwright-e2e,web-ui}/module.json` — extension
  manifests matching today's `enableOne` mount sets (D-1, D-10).
- Telemetry `cli/` source_root — `cli/scaffold/state/telemetry/` +
  `HARNESS_FILES` entries, closing the `G-16` installed-side-only anomaly
  (Q-NEW-4: scaffold placement, walk-stamped by `versions.mjs`).
- `cli/src/install/registry.mjs` — manifest loader + validator (fail closed on
  unregistered `contributes` type, consumer `commands`/`phases`, `engines.asdd`
  mismatch, source-tree escape, inter-manifest mount collision per `G-15`).
- `installPortableSteering` — replace the hardcoded `STEERING` array with a
  `cli/steering/` top-level file walk (G-8 two-SoT fix; the array duplicated the
  directory listing).
- Registry `files` section — file-level install rows `{src, dest, class,
  install, self}` as the single enumeration SoT; `HARNESS_FILES`, `BINDINGS`,
  `FOLDER_READMES`, `SELF_COPIES`, `installAgentsCore`, and `installDocsRoot`
  derive from it (D-9 sites).
- `enableOne` — manifest-driven mounts via `mountMap` (the switch dies; D-10
  complete). `MODULES` derives from `cli/modules/` directories.

Scope guard: no `.gitattributes`, no `.gitignore` untracking, no `asdd kit
regen` umbrella, no `PHASES` refactor — those land in follow-on slices.
