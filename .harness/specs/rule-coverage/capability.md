# Capability: ADR coverage and tested rules (rule-coverage)

## Category
NEW_CAPABILITY

## Scope
- Pitch ID: ad-hoc (ROADMAP P1)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md).

## Actors
- Tech Lead: owns ADRs and rules; decides which generated rules to accept.
- Host agent: writes rules and their tests in the host when the user asks.

## Entities
- ADR: a decision record file in the project's ADR location, with an id (`ADR-NNN`), title, status, and an optional
  `Enforcement: manual` marker (not checkable by code rules).
- ADR coverage: active, enforceable ADRs that at least one rule cites in `metadata.adr`.
- Dangling reference: a rule citing an ADR id that has no file, or whose ADR is superseded or deprecated.
- Rule test: a target file next to a rule file, annotated `ruleid:` / `ok:`, run by `semgrep --test`.
- Rule readiness: valid, tested, test passing, and not noisy on the repository.

## Out of Scope
Writing rules on the server; judging an ADR's content; an ADR authoring tool.
