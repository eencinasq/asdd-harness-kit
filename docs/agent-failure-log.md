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

