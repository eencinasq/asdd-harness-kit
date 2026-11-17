# skill-eval-portable — Spec (lite)

## Intent

`asdd skill-eval` only works in the kit checkout: its fixtures call `node cli/bin/asdd.mjs` and are not in the npm
package. In an installed project the eval is absent, so QG-LEARN-10 (a guide-changing steering proposal needs a passing
skill-eval result) can never be satisfied there — the learning loop is blocked outside the kit. Ship the fixtures,
make their probes runtime-agnostic with an `{asdd}` placeholder resolved by skill-eval, and also read project fixtures.

Mapped: `cli/src/harness/skill-eval-lib.mjs`, `cli/src/harness/skill-eval-lib.test.mjs`, `cli/src/harness/skill-eval.mjs`, `cli/eval/skills/**`, `package.json` (`files`), `cli/test/install.sh` (package contents check), `cli/versions.json` (if shipped files are versioned)

## Requirements

- **REQ-001.** Fixture probes shall use an `{asdd}` placeholder that skill-eval resolves to the kit CLI in the kit checkout, to `node_modules/.bin/asdd` when present, else to `asdd` on PATH; no shipped fixture shall hard-code `node cli/bin/asdd.mjs`.
- **REQ-002.** The npm package shall include `cli/eval/skills/**`, and skill-eval shall find those fixtures from the installed package.
- **REQ-003.** skill-eval shall also read project fixtures under `.harness/eval/skills/<skill>/`; a project fixture with the same file name as a shipped one overrides it.
- **REQ-004.** In an installed project, `asdd skill-eval` shall pass the shipped fixtures for the kit skills installed there.
