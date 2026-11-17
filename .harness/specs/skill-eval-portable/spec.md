# skill-eval-portable — Spec (lite)

## Intent

`asdd skill-eval` only works in the kit checkout: its fixtures call `node cli/bin/asdd.mjs` and are not in the npm
package. In an installed project the eval is absent, so QG-LEARN-10 (a guide-changing steering proposal needs a passing
skill-eval result) can never be satisfied there — the learning loop is blocked outside the kit. Ship the fixtures,
make their probes runtime-agnostic with an `{asdd}` placeholder resolved by skill-eval, and also read project fixtures.

Mapped: `cli/src/harness/skill-eval-lib.mjs`, `cli/src/harness/skill-eval-lib.test.mjs`, `cli/src/harness/skill-eval.mjs`, `cli/eval/skills/**`, `package.json` (`files`), `cli/test/install.sh` (package contents check and installed-app run), `cli/versions.json` and `.harness/config/versions.json` (if shipped files are versioned), `README.md` and `cli/README.md` (skill-eval rows and paragraph)

## Requirements

- **REQ-001.** Fixture probes shall use an `{asdd}` placeholder that skill-eval resolves to the asdd CLI running the evaluation (`node <package>/cli/bin/asdd.mjs`, shell-quoted) — the kit checkout's CLI in the kit, the devDependency or global package in a project — so a probe never runs a different asdd version than the one evaluating; no shipped fixture shall hard-code `node cli/bin/asdd.mjs`. (Spec-phase refinement of the draft order kit → `node_modules/.bin/asdd` → PATH: a global `asdd` on PATH can be an older version without the probed commands.)
- **REQ-002.** The npm package shall include `cli/eval/skills/**`, and skill-eval shall find those fixtures from the installed package.
- **REQ-003.** skill-eval shall also read project fixtures under `.harness/eval/skills/<skill>/`; a project fixture with the same file name as a shipped one overrides it.
- **REQ-004.** In an installed project, `asdd skill-eval` shall pass the shipped fixtures for the kit skills installed there.
- **REQ-005.** A fixture may declare `requires` (`command:<name>` on PATH, `path:<repo-relative path>`); when a requirement is unmet the case is reported `skipped` with the reason, counted apart from passed and failed, and never fails the run or counts as a regression.
- **REQ-006.** Fixture probes shall use a `{skill_dir}` placeholder for the evaluated skill's directory (the folder of the `SKILL.md` that was found: `cli/skills/<name>` in the kit, `.agents/skills/<name>` in a project) instead of a hard-coded kit path.
