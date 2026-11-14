# asdd-p1 — Spec (lite)

## Intent

Deliver ASDD-ROADMAP **P1.1–P1.3**: agent-native slash skills that call `asdd`, a read-only pipeline dashboard the Tech Lead can open without digging through JSON, and a cheap converge sensor before features go `passing`. Does not include P0.3 or P2.

## Requirements

- **REQ-001 (MUST).** The kit shall ship four skills — `asdd-status`, `asdd-next`, `asdd-implement`, `asdd-converge` — under `cli/skills/`, each instructing the agent to run the matching `asdd` CLI (never inventing harness SoT), with Use when / Do NOT use, and a verification gate that names the CLI command.
- **REQ-002 (MUST).** `asdd status --html` shall emit a self-contained HTML dashboard of active slices (phase, status, mode, escalation), active features, pipeline metrics, and recent stop-FAIL codes from learning summaries.
- **REQ-003 (MUST).** The knowledge MCP server shall expose a read-only `pipeline_status` tool that returns the same metrics object as `asdd status --json` (vendored `pipeline-metrics`), writing nothing under `.harness/`.
- **REQ-004 (MUST).** `asdd converge [--slice <id>] [--strict] [--json]` shall check in-progress and passing features: non-empty `req_ids` when the slice has MUST requirements, each `req_id` mentioned in a test file, and non-empty `evidence` when status is `passing`. Missing test mention is WARN by default and FAIL with `--strict`. Exit non-zero on any FAIL.
- **REQ-005 (MUST).** `asdd check` shall include converge FAILs (not only WARNs) for features that are `passing` with missing evidence or empty `req_ids` when the slice lists MUST requirements (short path before session close).
