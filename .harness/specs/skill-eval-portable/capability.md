# skill-eval-portable — Capability (backfilled on escalation from lite)

**Capability:** `asdd skill-eval` evaluates skills the same way in the kit checkout and in an installed project.

- **Actor:** kit maintainer, adopting engineer, Tech Lead deciding a guide-changing steering proposal (QG-LEARN-10).
- **Outcome:** shipped fixtures run from the npm package with `{asdd}` (the running CLI) and `{skill_dir}`; projects add or
  override cases under `.harness/eval/skills/`; cases whose `requires` the machine lacks are skipped, not failed.
- **Escalation:** E1 only (cli/, package.json, README.md); no new domain terms, no dissent.
