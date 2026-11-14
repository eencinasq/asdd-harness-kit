# asdd-p3 — Spec (lite)

## Intent

Deliver ASDD-ROADMAP **P3.1, P3.2, and P3.5** only: wave parallelism hints from owners/deps, a read-only multi-repo portfolio view, and a semantic EARS converge eval batch. **Out of scope for this slice (deferred to a later kit version):** P3.3 Windows hooks, P3.4 Spec Kit/OpenSpec import.

## Requirements

- **REQ-001 (MUST).** `asdd waves [--slice <id>] [--json]` shall read features (`depends_on`, `owner`, `scope_paths`, `status`) and print a parallelism plan: ready vs blocked features, which ready features may run concurrently (unique owners + non-overlapping scopes), and suggested wave layers (topological). It writes nothing under `.harness/`.
- **REQ-002 (MUST).** `asdd portfolio [--json]` shall read an optional `.harness/config/portfolio.json` listing sibling repo paths and, for each path that exists with a harness registry, print a read-only summary (slice counts by status/mode). Missing paths are WARN; the command never writes into other repos.
- **REQ-003 (MUST).** The kit shall ship a deterministic EARS converge eval set under `cli/eval/converge-ears/` (≥6 cases, ≥2 clean) and `asdd converge-eval` that scores fixtures (expected finding codes vs actual) and exits non-zero when any case mismatches.
