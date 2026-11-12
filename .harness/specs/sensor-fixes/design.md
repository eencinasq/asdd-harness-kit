# Design: sensor-fixes

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `cli/src/harness/scope-lib.mjs` | `fileLister` drops `git ls-files --deleted` from the git listing (REQ-001) |
| `cli/src/harness/drift-lib.test.mjs` | Delete-then-commit regression test (AC-001) |
| `tools/{spec-drift,jev-gate,knowledge}/src/harness/scope-lib.mjs` | Refreshed by `asdd kit vendor` (generated copies) |
| `tools/spec-drift/test/mcp.e2e-spec.ts` | `AppModule` imported dynamically after the sandbox environment is set (REQ-002) |

## Domain Placement
- Owning domain: harness sensors (kit tooling); no product code.
- Integration boundaries: DRIFT-02 and `asdd sync` call `evidenceHash`; the MCP servers use the vendored copy.
- Documented exceptions: none.

## Domain Impact
No new domain terms (domain phase skipped).

## Decisions
- **ADR-001 — Filter at the listing, keep `<missing>`.** Removing deleted files where the list is built fixes every caller
  (`scopeFiles`, DRIFT-01 listings) at once. `evidenceHash` keeps its `<missing>` fallback for a file that disappears
  between listing and reading. Rejected: `existsSync` per file in `scopeFiles` (one stat per file instead of one git call).
- **ADR-002 — Dynamic import over provider override.** `AnalysisService` reads `ConfigService`; the other e2e files
  override an options provider, but analysis has none. Importing `AppModule` after the environment is set keeps the test
  on the real configuration path. Rejected: adding an options token to analysis only for tests.

## Risks
- A hash recorded while a scoped file was deleted-but-indexed changes once. None exists now (`git ls-files --deleted` empty).

Design confidence 0.9.
