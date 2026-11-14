# Capability: Deeper spec-drift analysis (spec-drift-depth)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (ROADMAP P3)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md).

## Actors
- Tech Lead / auditor: reads the traceability matrix and its gaps.
- Reviewer (host agent and human): reviews a PR starting with the riskiest files; confirms publishing.
- Architect: declares dependency layers in `domain-layer.project.md`.
- Host (MCP client): runs long analyses in the background; answers elicitation requests.

## Entities
- Trace row: one requirement with its features (and status), owned files, test files, and PR numbers; gaps
  `no-feature`, `no-test`, `not-passing`.
- File risk: churn (commits in 90 days), requirement links, findings, score, level, reasons.
- Dependency layer: name, path globs, layers it may depend on; import graph; cycle (strongly connected files).
- Analysis job: id, tool, status (running, done, failed), progress, result.
- Elicitation: a structured question to the user through the host (confirm publish; ticket key).

## Out of Scope
CodeQL; non-GitHub providers; CI mode; changes to the kit's audit.
