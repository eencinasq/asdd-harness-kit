# skill-eval — Spec (lite)

## Intent

Measure what a skill or agent *does*, not only how it is written. Today `asdd kit skills-lint` / `agents-lint` check
grammar and `converge-eval` scores EARS fixtures; nothing proves that a changed skill still produces the expected
outcome on real tasks. Add `asdd skill-eval`: per-skill task fixtures, a before/after comparison against a baseline,
and regression reporting (P5 roadmap, gap G16). Escalation is likely if the runner needs a model adapter per runtime.

Mapped: `cli/src/harness/skill-eval*.mjs`, `cli/eval/skills/**`, `cli/src/harness/commands.mjs`, `README.md` (command row)

## Requirements

- **REQ-001.** The CLI shall provide `asdd skill-eval [--skill <name>] [--json]` that runs the fixtures under `cli/eval/skills/<skill>/` and reports pass rate per skill.
- **REQ-002.** Each fixture shall declare an input task, the expected observable outcome, and deterministic assertions (files, commands, exit codes) — no LLM-as-judge in the gate path.
- **REQ-003.** WHEN `--baseline <ref>` is given, the command shall run the fixtures against the skill body at that git ref and report the delta (improved / regressed / unchanged).
- **REQ-004.** IF any fixture regresses against the baseline, THEN the command shall exit non-zero and name the regressed fixtures.

## Depends on

None. Unblocks: `learn-eval-gate`, `ui-insights`.
