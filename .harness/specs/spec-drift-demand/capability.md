# Capability: On-demand spec-drift features (spec-drift-demand)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (ROADMAP P4 without P4.5)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md).

## Actors
- Tech Lead: asks where a drift came from; reads several repositories at once; sets up the CI review.
- Developer (through the host agent): fixes a rule's violations on request.
- CI job: runs the review on a pull request and leaves it pending.
- Reviewer: submits the pending review.

## Entities
- Drift origin: blame commit (sha, author, date, subject, PR) and first appearance of the line text.
- Review cost: minutes from start to publish, tool calls by name, characters of text returned.
- Engine: Semgrep (default) or CodeQL.
- Repository summary: latest snapshot, trend direction, latest audit level and spec compliance.

## Out of Scope
GitLab, Bitbucket, Azure DevOps (P4.5); tokens of the model (the server cannot see them).
