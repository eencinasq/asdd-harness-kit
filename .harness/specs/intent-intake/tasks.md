# intent-intake — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Parse, validate, and re-check Intent items (intake-lib) | REQ-001, REQ-003 | `cli/src/harness/intake-lib.mjs`, `cli/src/harness/intake-lib.test.mjs` |
| TASK-002 `asdd intake` CLI and slice provenance (`init-slice --source-json`) | REQ-002, REQ-003 | `cli/src/harness/intake.mjs`, `cli/src/harness/init-slice.mjs`, `cli/src/harness/init-slice.test.mjs`, `cli/src/harness/intake-lib.test.mjs`, `cli/src/harness/commands.mjs` |
| TASK-003 `intent-evidence` validator and severity binding | REQ-004 | `cli/src/harness/validators/intent-evidence.mjs`, `cli/src/harness/check-invariants.mjs`, `cli/src/harness/intake-lib.test.mjs`, `cli/scaffold/config/project.schema.json`, `cli/scaffold/config/README.md` |
| TASK-004 Registration, docs, and the external-trackers intake flow | REQ-005 | `package.json`, `README.md`, `cli/README.md`, `cli/skills/external-trackers/SKILL.md` |
