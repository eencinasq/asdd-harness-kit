# behavior-tests — Intent

Adopt "Test Behavior, Not Implementation" (Uncle Bob, ub-mode SKILL.md): a test calls the code the way its user does
and checks the result that user would see; a test that would still pass when every function returned nothing is thrown
out.

- `cli/skills/test-driven-development/SKILL.md` — RED drives the public entry point and asserts the observable result;
  the Verification Gate rejects vacuous tests and tests that assert only internal calls or private state.
- `cli/agents/asdd-qa-agent.md` — a vacuous or implementation-only test does not cover a requirement; report `UNCOV-NNN`
  with the reason.
- `cli/eval/skills/test-driven-development/behavior-not-implementation.json` — skill-eval fixture pinning the rule.

Installed copies (`.agents/`, `.cursor/agents/`, `.harness/config/installed-versions.json`) are regenerated with
`asdd kit self`. Not in scope: changing any CLI behavior.
