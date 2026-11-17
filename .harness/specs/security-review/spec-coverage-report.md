# Spec coverage report: security-review

**Auditor:** claude-sec (self-QA). TL authorized end-to-end run (2026-11-17).

| REQ | Feature | Tests that pin it | Result |
|---|---|---|---|
| REQ-001 Vendored methodology + notice | TASK-001 | `src/security/checklists.spec.ts` (15 checklists with source header; schema + validator present); `THIRD_PARTY_NOTICES.md` MIT section | PASS |
| REQ-002 Recon + checklist selection + bounded prompt | TASK-002, TASK-003 | `src/security/recon.spec.ts`; `src/security/security.service.spec.ts` (run outside repo, prompt ≤ 8000); `test/security.e2e-spec.ts` | PASS |
| REQ-003 Checklist paging | TASK-001, TASK-003 | `checklists.spec.ts` (≤ 6000 chars, unknown id); `test/security.e2e-spec.ts` (tool error lists ids) | PASS |
| REQ-004 Findings validation | TASK-002, TASK-003 | `src/security/findings.spec.ts` (vendored validator, trace order, validation plan, repo file/line); `security.service.spec.ts`; `test/security.e2e-spec.ts` (tool error lists every problem) | PASS |
| REQ-005 Coverage ledger | TASK-003 | `security.service.spec.ts` (reviewed ids, unknown id warning, merge by fingerprint); `test/security.e2e-spec.ts` | PASS |
| REQ-006 Static baseline | TASK-004 | `semgrep --test src/security/semgrep` 10/10; `src/security/builtin-pack.spec.ts`; `test/security.e2e-spec.ts` (real Semgrep: builtin-security finds security.js.command-injection) | PASS |
| REQ-007 PR lens `<security>` block | TASK-005 | `src/security/lens.spec.ts`; seen in `test/pr-review.e2e-spec.ts` next-group output for `src/util.py` (eval) | PASS |
| REQ-008 PR security finding evidence | TASK-005 | `lens.spec.ts`; `test/pr-review.e2e-spec.ts` (skipped-with-warning case) | PASS |
| REQ-009 Dashboard ≤ 8 KB + PR marker | TASK-003, TASK-006 | `ui/security-dashboard/model.spec.ts`; `security.service.spec.ts` (< 8 KB); `test/mcp.e2e-spec.ts` (view resource, tool meta) | PASS |
| REQ-010 Read-only + safety text + toolset | TASK-003 | `test/toolsets.e2e-spec.ts` (security toolset loads only its tools/view); `test/security.e2e-spec.ts` (git status clean, safety rules in prompt); `src/config/toolsets.spec.ts` | PASS |

**Suites:** spec-drift `pnpm test` 249/249; `pnpm test:e2e` 140/141 — the single failure (`each group brings its own diff…`, stale assertions) also fails on a clean build of `08c3e8a` (baseline 131/133); root `npm test` 252/252.

**Coverage:** 10/10 MUST requirements implemented and tested. **Gate:** PASS.
