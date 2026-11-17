# Intent: security-review

## Source

- **Pitch ID:** ad-hoc (Tech Lead request 2026-11-17: "in the MCP App for spec drift add a new security verification, for the whole project and for code review, based on cloudflare/security-audit-skill")
- **Scope ID:** none — one slice
- **Reference:** https://github.com/cloudflare/security-audit-skill/tree/main/skills/security-audit (MIT, Cloudflare, Inc.)

## Problem

The `spec-drift` MCP server checks architecture, standards, and spec drift, and reviews PRs per language checklist,
but it has no security verification: no project-wide audit, no security lens in code review, and no way to tell a
real vulnerability (a crossed trust boundary with source evidence) from a generic warning.

## Desired Outcome

A security verification in the `spec-drift` server and its MCP App, built on the Cloudflare security-audit methodology:
a project-wide audit and a security lens in PR review, whose findings must name a trust boundary, a source trace
(entrypoint → propagation → sink) and `file:line` evidence, validated against the skill's findings schema; plus a
deterministic static baseline from the existing engines; shown in the dashboards.

## Must-have outcomes

- MH-01 Vendored methodology: the skill's checklists and `report-schema.json` under `tools/spec-drift/` with the MIT notice in `THIRD_PARTY_NOTICES.md`; adapted to the server (no full-audit file writes, no target execution).
- MH-02 Project audit tools: `security_audit_start` (reconnaissance → relevant checklists, prompt, coverage ledger) and `security_audit_submit_findings` (schema validation; reject findings without a concrete boundary, trace, and evidence; confirmed vs needs_validation).
- MH-03 Static baseline: `analyze_security` running a `security` rule set with the existing engine (Semgrep/CodeQL), no LLM.
- MH-04 PR review lens: diff groups that touch security-relevant surfaces get the matching security checklist; security findings pass the same validation before publish.
- MH-05 MCP App: a Security view (findings by severity, checklist coverage, needs-validation) and security markers in the PR review view; results stay under the host size limits (paged).

## No-gos

Running target code, network access, probing endpoints, installing dependencies (the skill's execution-safety rules);
writing audit artifacts into the repository; LLM-as-judge in the deterministic baseline; posting PR comments without
the existing human publish step.

## Depends on

None.
