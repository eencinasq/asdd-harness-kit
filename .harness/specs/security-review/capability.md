# Capability: security-review

## Source

[intent.md](./intent.md) — MH-01…MH-05.

## Capability

**Security verification in the spec-drift MCP server**, grounded in the Cloudflare security-audit methodology:
the server tells an agent *where* and *how* to look (reconnaissance → applicable checklists), accepts only findings that
prove a crossed trust boundary with source evidence (the skill's `report-schema.json` and `validate-findings.cjs`),
adds a deterministic static baseline, and shows the results in its MCP App.

## Actors

| Actor | Goal |
|---|---|
| Engineer / reviewer agent | Audit a repository or a PR for vulnerabilities and report them with evidence |
| Tech Lead | See findings by severity, what still needs validation, and which checklists were covered |
| CI / headless use | Run a deterministic security scan without a model |

## Sub-capabilities

1. Vendored methodology (checklists, findings schema, validator) with license attribution.
2. Project audit session: reconnaissance, checklist selection, bounded prompt, coverage ledger, findings submission with validation.
3. Static baseline scan (`security` rule set; built-in starter pack when the repo has none).
4. PR review security lens: security checklist per relevant diff group; security findings must carry boundary + trace evidence.
5. Security dashboard (MCP App view) and security markers in the PR review view.

## Out of scope

Running target code, network access, dependency installation (the skill's execution-safety rules); writing audit
artifacts into the repository; LLM judgment inside the static baseline; publishing PR comments without the human step.
