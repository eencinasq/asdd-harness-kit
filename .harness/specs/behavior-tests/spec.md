# behavior-tests — Spec (lite)

## Intent

TDD and QA accept any test that names a requirement and fails first. Add the criterion that rejects tests pinning
implementation or nothing: the test drives the public entry point and asserts the observable result.

Mapped: `cli/skills/test-driven-development/SKILL.md`, `cli/agents/asdd-qa-agent.md`,
`cli/eval/skills/test-driven-development/behavior-not-implementation.json`

## Requirements

- **REQ-001.** The test-driven-development skill's RED step shall require the test to call the code through the public
  entry point its user or caller uses and to assert the result that user would see, without mocking the unit's own
  collaborators, asserting internal calls or private state, or snapshotting internals.
- **REQ-002.** The test-driven-development skill's Verification Gate shall include a negative check that rejects a new
  test that would still pass if the implementation returned nothing or an empty value, or that asserts only internal
  calls or private state.
- **REQ-003.** When a test that pins a requirement is vacuous or asserts only implementation details, the QA agent shall
  not count it as coverage and shall report the requirement as `UNCOV-NNN` with that reason.
- **REQ-004.** The skill-eval suite shall include a test-driven-development fixture that fails when the skill body
  lacks the behavior-over-implementation rule or the vacuous-test negative check.
