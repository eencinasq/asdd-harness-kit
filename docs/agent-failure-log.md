# Agent Failure Log

> Append here when an agent repeatedly fails on a slice and the slice is set to `blocked`.
> One entry per incident; keep it concise.

## Template

```
- **Date:** YYYY-MM-DD
- **Slice:** <slice-id>
- **Signature:** <check-or-area>:<short-kebab-cause>   (reuse the same value for the same failure)
- **Agent:** <agent-id>
- **Phase:** <phase>
- **Failure:** <what happened>
- **Remediation:** <what was tried / what fixed it>
```

## Incidents

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-task-planning
- **Phase:** task_planning
- **Signature:** tests:negated-assertion-ignored-by-errexit
- **Failure:** Seeding the kit's domain model in docs/architecture/ during Domain leaked it into installed projects, and `npm test` still passed: `! grep …` lines in scripts/test-install-into.sh (2) and scripts/test-lifecycle.sh (1) never fail under `set -e`.
- **Remediation:** Domain model staged in .harness/specs/kit-hygiene/ until REQ-011 lands; the negated assertions are rewritten in the REQ-002 task, and check-guidance rejects bare `!` assertions in kit test scripts.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** claude
- **Phase:** task_planning
- **Signature:** git:committed-without-checking-branch
- **Failure:** Two commits meant for `main` landed on `fix/managed-runtime-files`; the branch had been switched outside the session and the agent did not run `git branch --show-current` before committing.
- **Remediation:** Tech Lead chose a fast-forward of `main` to the branch head. Agents check the current branch before every commit.

