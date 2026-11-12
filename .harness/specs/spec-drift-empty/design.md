# Design: spec-drift-empty

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `tools/spec-drift/src/analysis/domain/rules-prompt.ts` (new) | `buildRulesGeneratePrompt` moved here from pr-review (analysis owns rules); kit-aware step; `done` text per caller |
| `tools/spec-drift/src/pr-review/architecture/*` | Import the moved prompt builder |
| `tools/spec-drift/src/analysis/{analysis.service,analysis.types,analysis.output,analysis.presenter,analysis.prompts}.ts` | `no-rules` summary instead of `UnknownPackError` for a mode with no set; `generate-architecture-rules` prompt (REQ-001, 002) |
| `tools/spec-drift/ui/analysis-dashboard/main.ts`, `ui/analysis-dashboard.html` | No-rules state, "Ask the agent to write rules" and "Copy prompt" (REQ-002) |
| `cli/src/harness/semgrep-lib.mjs` (+ test, vendored copies) | `.semgrep/architecture` folder as a config candidate (REQ-003) |
| `tools/spec-drift/src/audit/{audit.service,audit.output,audit-insight.tools}.ts` | `no_data` results; `generate_prompt` when the architecture check has no rules (REQ-003, 004) |
| `tools/spec-drift/ui/audit-dashboard/{model,main}.ts` | "No data" state; rules prompt action on the architecture card (REQ-002, 004) |
| `cli/steering/spec-drift.md`, `tools/spec-drift/README.md` | Document the candidates, empty states, prompt |

## Domain Placement
- Owning domain: spec-drift MCP server (kit tooling); no product code.
- Integration boundaries: analysis reads `ANALYSIS_REPO_ROOT`; audit reads `HARNESS_ROOT` through the vendored harness.
- Documented exceptions: none.

## Domain Impact
New term "no-data result" (capability.md); no product domain change (domain phase skipped).

## Decisions
- **ADR-001 — `no-rules` is a status, not an error.** An error tells the model the call failed; a `no-rules` summary
  (empty drift, `generatePrompt`) lets every host show the offer. Explicitly named unknown packs stay an input error.
- **ADR-002 — The agent writes rules in the host.** The server returns a prompt (tool result, MCP prompt, dashboard
  `sendMessage`, as PR review does); it never writes `.semgrep/`. Keeps the read-only invariant.
- **ADR-003 — One folder layout.** Rules go to `.semgrep/architecture/` and `.semgrep/standards/` (what the analyzer and
  PR review read); the kit's audit adds `.semgrep/architecture` as its last config candidate, so one generation serves both.
- **ADR-004 — `no_data` is a field, not a different shape.** Each tool keeps its output schema (optional fields, empty
  arrays) and adds `no_data: { reason, next }`, so typed clients do not break and the SDK's validation passes.

## Risks
- A repo with an unrelated `.semgrep/architecture/` folder is now scanned by the audit (it already was by the analyzer).

Design confidence 0.87.
