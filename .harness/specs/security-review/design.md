# Design: security-review

## Components

| Component | Path | Role |
|---|---|---|
| Methodology (vendored) | `tools/spec-drift/src/security/methodology/**` | Cloudflare checklists (`*.md`), `report-schema.json`, `validate-findings.cjs`, `NOTICE.md`; copied to `dist/server/security-methodology/` by the build |
| Checklists | `tools/spec-drift/src/security/checklists.ts` | Ids, titles, file names; load + page a checklist |
| Reconnaissance | `tools/spec-drift/src/security/recon.ts` | Pure: tracked files → languages, surfaces, applicable checklists |
| Findings validation | `tools/spec-drift/src/security/findings.ts` | Loads the vendored validator via `createRequire`; sorts by fingerprint; adds repo-evidence checks (file inside repo, line in range) |
| PR lens | `tools/spec-drift/src/security/lens.ts` | Pure: group files + diff → applicable checklists; `<security>` block; PR finding evidence check |
| Built-in pack | `tools/spec-drift/src/security/semgrep/**`, `tools/spec-drift/src/security/builtin-pack.ts` | Starter Semgrep rules (+ tests) used by `analyze_security` when the repo has no `.semgrep/security/` |
| Service + tools | `tools/spec-drift/src/security/security.{service,tools,schemas,output,module}.ts` | Runs under `$XDG_STATE_HOME/spec-drift/security/<project>/run-<N>/`; tools `security_audit_start`, `security_audit_checklist`, `security_audit_submit_findings`, `security_audit_status` |
| Analysis mode | `tools/spec-drift/src/analysis/{analysis.types,analysis.schemas,analysis.tools,analysis.service}.ts`, `src/analysis/domain/pack-selection.ts` | `ScanMode` `security`, `analyze_security` tool |
| PR review hooks | `tools/spec-drift/src/pr-review/{pr-review.views,pr-review.service}.ts`, `tools/spec-drift/test/pr-review.e2e-spec.ts` | Append `<security>` to next-group instruction; filter security findings without evidence |
| Toolset | `tools/spec-drift/src/config/toolsets.ts`, `src/app.module.ts` | `security` toolset; server instructions |
| Security view | `tools/spec-drift/ui/security-dashboard.html`, `ui/security-dashboard/**` | MCP App: verdict/severity counts, ledger, findings list (paged) |
| PR view marker | `tools/spec-drift/ui/pr-review/main.ts` | Security badge on findings |
| Build | `tools/spec-drift/scripts/build-server.mjs`, `tools/spec-drift/package.json`, `tools/spec-drift/biome.json` | Copy methodology + rules to dist; build the new view; lint ignores vendored files |
| Tests | `tools/spec-drift/src/security/*.spec.ts`, `tools/spec-drift/test/{security,mcp,toolsets,output-schemas}.e2e-spec.ts` | Unit + e2e |
| Docs | `tools/spec-drift/README.md`, `tools/spec-drift/THIRD_PARTY_NOTICES.md`, `README.md` | Tools, toolset, notice |

## Data

- **Run state** (`run.json`, outside the repo): `{ id, repoRoot, startedAt, recon: { languages, surfaces, files }, ledger: [{ id, title, status: pending|reviewed }], findings: [...] }`.
- **Findings**: the vendored schema's three variants (`confirmed`, `needs_validation`, `rejected`); stored as submitted (sorted), merged by `fingerprint`.
- **Severity** for counts: `severity.overall_severity` of confirmed findings; needs_validation counts separately.

## Tool contracts

| Tool | Toolset | Input | Output |
|---|---|---|---|
| `analyze_security` | analysis | as `analyze_standards` (`packs`, `paths`, `severity`) | `ScanSummary` (dashboard), `mode: security`, `packs` names `builtin-security` when the starter pack ran |
| `security_audit_start` | security | `{ paths?: string[] }` (focus) | text prompt + `{ runId, languages, surfaces, ledger }` |
| `security_audit_checklist` | security | `{ id, page? }` | text page + `{ id, page, pages }` |
| `security_audit_submit_findings` | security | `{ runId, findings: unknown[], checklists_reviewed?: string[] }` | `{ accepted, errors[], ledger }`; `isError` with every error when rejected |
| `security_audit_status` | security | `{ runId?, page? }` (latest run when omitted) | dashboard: `{ run, counts, ledger, findings(page) }` ≤ 8 KB |

## Sequences

1. `security_audit_start` → recon → ledger → prompt (core principles + execution-safety + listed checklists + submit instructions).
2. Agent reads checklists (`security_audit_checklist`), hunts read-only, submits findings per checklist → validated → ledger updated.
3. `security_audit_status` opens the view; `analyze_security` adds the deterministic baseline.
4. PR review: `withNextGroup` adds `<security>` for relevant groups; `submitFindings` drops security findings without boundary + `file:line`.

## ADRs

- **ADR-001 Vendor the validator, do not port it.** `validate-findings.cjs` is loaded at runtime via `createRequire` from the vendored copy so the server enforces exactly the skill's contract (MIT allows it). A port would drift from upstream.
- **ADR-002 Run state outside the repository.** Like PR review's fallback root: `$XDG_STATE_HOME/spec-drift/security/`. The skill forbids audit artifacts inside the target unless ignored; the server never writes into the repo.
- **ADR-003 Built-in starter pack only when the repo has no `security` set and the engine is Semgrep.** Repo rules always win; CodeQL needs its own queries, so it reports `no-rules` instead.

## Traceability

| REQ | Component |
|---|---|
| REQ-001 | methodology, THIRD_PARTY_NOTICES |
| REQ-002, REQ-003 | recon, checklists, security tools |
| REQ-004, REQ-005 | findings, security service |
| REQ-006 | builtin-pack, analysis mode |
| REQ-007, REQ-008 | lens, PR review hooks |
| REQ-009 | security view, PR marker |
| REQ-010 | tool descriptions, toolset |
