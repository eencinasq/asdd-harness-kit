# Capability: Measured review quality (review-quality)

## Category
IMPROVEMENT

## Scope
- Pitch ID: ad-hoc (ROADMAP P0)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
See [intent.md](./intent.md). The reviewer posts comments on people's PRs; without a measured precision and recall, a
change to the prompt, the rule docs, or the model is judged by impression, and noisy rules are discovered one reviewer at
a time.

## Actors
- Tech Lead: owns the reviewer's prompt, rule docs, and review profile; reads team review quality.
- Reviewer: a developer who runs PR reviews with the MCP server and publishes them.
- Kit maintainer: changes the prompt or rule docs and runs the evaluation before and after.

## Entities
- Evaluation case: a unified diff, the defects it really has (path, line, optional rule, category), and its language.
- Known noise: draft findings a human removed on a real review (labels of what must not be reported).
- Evaluation baseline: a saved score summary a later run is compared with.
- Publish metrics: per published review, drafted / kept / edited / removed comments per checklist rule.
- Review signal: one checklist rule's removed comments on one published review (`review:<rule>`).

## Out of Scope
Running the model automatically; uploading cases anywhere; changing the review prompt or rule docs (this slice measures).
