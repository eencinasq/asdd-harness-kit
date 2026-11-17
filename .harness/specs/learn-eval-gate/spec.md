# learn-eval-gate — Spec (lite)

## Intent

Turn the learning loop from observational to experimental. Today an `SP-*` proposal is verified only after the fact
(10 quiet sessions). Require guide-changing proposals to carry a `skill-eval` result before they can be accepted, so a
regression is caught before it ships (P5 roadmap, gap G16).

Mapped: `cli/src/harness/validators/learning.mjs`, `cli/src/harness/learning-lib.mjs`, `cli/src/harness/learning-lib.test.mjs`, `cli/steering/quality-gates.learn.md`, `cli/steering/templates/steering-proposal.md` (sources — edit these, never the copies), `.harness/steering/quality-gates.learn.md` and `.harness/steering/templates/steering-proposal.md` (copies refreshed by `asdd kit self`), `cli/versions.json` (regenerated)

## Requirements

- **REQ-001.** The steering-proposal template shall carry an `eval:` frontmatter field (command + result reference).
- **REQ-002.** IF a proposal with `change: add-guide | tighten-guide` has `status: accepted` or `applied` and no `eval` result, THEN `asdd check` shall FAIL with a new `QG-LEARN-*` rule.
- **REQ-003.** IF the referenced eval result shows a regression, THEN `asdd check` shall FAIL for that proposal.
- **REQ-004.** Proposals of other `change` kinds shall keep today's behavior (no eval required).

## Depends on

`skill-eval`.
