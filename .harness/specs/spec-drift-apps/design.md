# Design: spec-drift-apps

**Author:** asdd-pipeline (this session) · **Model/Tool:** claude-opus-5-5

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `tools/spec-drift/src/audit/audit.output.ts` (new) | Zod output schemas for the audit tools, `audit_query`, `learning_report` |
| `tools/spec-drift/src/analysis/analysis.output.ts` (new) | Output schemas for the analysis tools |
| `tools/spec-drift/src/audit/audit.tools.ts`, `audit.schemas.ts`, `audit.service.ts`, `audit.types.ts`, `harness-libs.ts` | `outputSchema` wiring; `audit_query` and `learning_report` |
| `tools/spec-drift/src/audit/audit-query.ts` (new) | Pure filter/group function |
| `tools/spec-drift/src/analysis/analysis.tools.ts` | `outputSchema` wiring |
| `tools/spec-drift/ui/audit-dashboard/{model,main}.ts`, `audit.css` | Triage commands to copy; Learning panel |
| `cli/src/harness/learning-lib.mjs`, `cli/src/harness/validators/learning.mjs` | `proposalFindings` moves into the library (one implementation); `learningReport()` |
| `tools/spec-drift/src/harness/learning-lib.mjs` | Vendored copy (`asdd kit vendor`) |
| Tests: `src/audit/*.spec.ts`, `ui/audit-dashboard/model.spec.ts`, `test/*.e2e-spec.ts`, `cli/src/harness/learning-lib.test.mjs` | Coverage of REQ-001…004 |
| `tools/spec-drift/README.md`, `README.md` | Tool table, read-only note |

## Domain Placement
- Owning domain: the spec-drift MCP server (presentation of harness data) and the harness learning library.
- Integration boundary: the server reads harness data only through the vendored libraries; it writes nothing.

## Domain Impact
- New terms: none.

## Architecture Decisions (ADRs)
- ADR-001: Loose output schemas (`z.looseObject`) over the known fields. Strongest argument against: loose schemas type
  less; accepted because the SDK rejects any non-error result that fails the schema (VAL-001), and payloads carry
  variants (paged, compacted, per-adapter fields).
- ADR-002: The server stays read-only (Tech Lead decision): triage and proposal decisions are CLI commands the view shows.
  Against: one more step for the Tech Lead; accepted, a write tool could be reached by the model on hosts that ignore
  app-only visibility, and a dismissal silences a sensor.
- ADR-003: `audit_query` filters and groups server-side instead of relying on a code-mode host. Against: duplicates what
  code mode would do; accepted, it works on every host and keeps one source of truth for finding fields.
- ADR-004: `proposalFindings` moves from the CLI validator into `learning-lib.mjs`, so `asdd check` and `learning_report`
  report the same missing fields.

## Sequence Diagram
```
Tech Lead → host : "learning report"
host → spec-drift : learning_report
spec-drift → learning-lib : derivePatterns + loadProposals + proposalFindings
spec-drift → host : patterns, proposals (missing fields, next command) [view: Learning panel]
Tech Lead → terminal : asdd learn --propose LP-… / asdd triage AUD-… --dismiss --reason "…"
```

## Component Map
```
audit.tools.ts ──> audit.service.ts ──> harness-libs (drift, audit, learning)
              └──> audit-query.ts (pure)
ui/audit-dashboard ──callServerTool──> learning_report / audit tools (read-only)
```

## Risks and Mitigations
- Schema too strict → e2e calls every tool on the sandbox and fails on a rejected result.
- Vendored copy stale → `asdd kit vendor --check` in `npm test`.

## Design Confidence Score
0.86
