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

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-qa
- **Phase:** qa
- **Signature:** drift:req-id-collision-across-slices
- **Failure:** OBS-001 — DRIFT-04 counted REQ-006 and REQ-013 as covered because tests from earlier slices mention the same unnamespaced IDs.
- **Remediation:** QA counted coverage by hand and blocked. Candidate fix (separate slice): namespace REQ mentions per slice or restrict DRIFT-04 to the slice's own test files.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-qa
- **Phase:** qa
- **Signature:** drift:priority-matrix-ignored
- **Failure:** OBS-002 — the requirement parser reports 13 MUST requirements; two are SHOULD in the priority matrix.
- **Remediation:** Recorded; fix belongs with OBS-001 in a drift slice.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-003 edited files owned by TASK-001 (scripts/test-install-into.sh); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-004 edited files owned by TASK-003 (asdd-implementation-agent.md, asdd-discovery-agent.md); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-005 edited files owned by TASK-001, TASK-003, TASK-004 (test-install-into.sh, package.json, install-into.sh, implementation agent); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-006 edited files owned by TASK-001, TASK-003, TASK-005 (test-install-into.sh, install-into.sh, package.json); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-007 edited files owned by TASK-001, TASK-003 (quality-gates.project.md, session-loop.md); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** planning:shared-files-across-serial-tasks
- **Failure:** TASK-008 edited files owned by TASK-001, TASK-005, TASK-006 (check-guidance.test.mjs, test-install-into.sh); DRIFT-02 reopened the earlier feature(s) and forced re-verification.
- **Remediation:** Re-verified and moved evidence_commit forward.

- **Date:** 2026-10-28
- **Slice:** kit-hygiene
- **Agent:** asdd-knowledge
- **Phase:** knowledge
- **Signature:** learning:escalation-counted-for-full-slices
- **Failure:** learning-lib counts lite escalation signals (E1…E5) for every slice; the full-mode kit-hygiene slice raised escalation:E1-scope-spread to ×4, inflating LP-a9dc05fe (SP-001).
- **Remediation:** Recorded; fix in a follow-up slice (count escalation signals only while the slice is lite).

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** drift:done-slice-features-reopened
- **Failure:** Editing scripts/test-install-into.sh (jev-module TASK-001) reopened passing features of the DONE slice kit-hygiene through DRIFT-02; jev-module could not mark features passing until the old slice was re-verified.
- **Remediation:** Re-verified kit-hygiene features at the new commit.

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** drift:done-slice-features-reopened
- **Failure:** Editing scripts/install-into.sh, package.json (jev-module TASK-003) reopened passing features of the DONE slice kit-hygiene through DRIFT-02; jev-module could not mark features passing until the old slice was re-verified.
- **Remediation:** Re-verified kit-hygiene features at the new commit.

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** drift:done-slice-features-reopened
- **Failure:** Editing scripts/test-install-into.sh (jev-module TASK-001, log-leak assertions) reopened passing features of the DONE slice kit-hygiene through DRIFT-02; jev-module could not mark features passing until the old slice was re-verified.
- **Remediation:** Re-verified kit-hygiene features at the new commit.

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** distribution:kit-log-seeded-into-projects
- **Failure:** The installer seeded the kit's own docs/agent-failure-log.md (with kit slice history) into projects, so a fresh project's learning loop warned about the kit's patterns.
- **Remediation:** Logs seed from scripts/templates/docs/; kit logs excluded from npm (jev-module TASK-003).

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** drift:done-slice-features-reopened
- **Failure:** jev-module TASK-005 (shared docs) and TASK-006 (budget binding) reopened kit-hygiene TASK-001/003/005/007 through DRIFT-02.
- **Remediation:** One re-verification pass at f0fd4e5.

- **Date:** 2026-10-28
- **Slice:** jev-module
- **Agent:** asdd-implementation
- **Phase:** implementation
- **Signature:** drift:done-slice-features-reopened
- **Failure:** jev-module QA coverage tests in scripts/test-install-into.sh reopened kit-hygiene TASK-001/005/006/008 through DRIFT-02.
- **Remediation:** Re-verified at 5eb0933.

