# skill-eval — Requirements (backfilled from spec.md on escalation)

## Requirements

- **REQ-001.** The CLI shall provide `asdd skill-eval [--skill <name>] [--json]` that runs the fixtures under `cli/eval/skills/<skill>/` and reports pass rate per skill.
- **REQ-002.** Each fixture shall declare an input task, the expected observable outcome, and deterministic assertions (files, commands, exit codes) — no LLM-as-judge in the gate path.
- **REQ-003.** WHEN `--baseline <ref>` is given, the command shall run the fixtures against the skill body at that git ref and report the delta (improved / regressed / unchanged).
- **REQ-004.** IF any fixture regresses against the baseline, THEN the command shall exit non-zero and name the regressed fixtures.

## Depends on

None. Unblocks: `learn-eval-gate`, `ui-insights`.
