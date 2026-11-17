# platform-contract — Tasks

## Tasks

- [x] **TASK-001 · Phase-2 declaration layer** — `cli/registry/contribution-points.json` 26-class registry + `module.json` manifests for core modules + manifest loader/validator (`readManifest`, `validateModules`).
- [x] **TASK-002 · Wave A enumeration SoT** — Registry `files[]` table as install SoT; derive `HARNESS_FILES`, `BINDINGS`, `FOLDER_READMES`, `SELF_COPIES`, `installAgentsCore`, `installDocsRoot`.
- [x] **TASK-003 · Wave B ignore & runtime enumerations** — Derive `COMMITTED_PATHS`, `RUNTIME_PATHS`, `RUNTIMES`, `RUNTIME_DIRS`, `KIT_TOOL_SERVERS`, `RETIRED_KIT_PATHS`, `RETIRED_JEV_FILES` from registry.
- [x] **TASK-004 · Wave C vocabulary & commands** — Derive `PHASES` and `SLICE_MODES` from `vocabulary.phases` and `vocabulary.modes`; derive `HARNESS_COMMANDS` and `KIT_COMMANDS` from registry.
- [x] **TASK-005 · Wave D generated-state & Git rules** — Retire global `state/manifest.json` (`RV1-AR-1`), untrack 42 generated files, generate `.gitattributes` and `.gitignore` merge policies.
- [x] **TASK-006 · Wave E generator umbrella & guardrails** — Implement `asdd kit regen` umbrella over registered generators, static adapter shape check (`checkExecutableShape`), enforce `G-16` source_root invariant, and re-pin `DOM-11` profiling citations.
