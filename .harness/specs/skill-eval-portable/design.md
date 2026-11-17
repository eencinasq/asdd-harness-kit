# skill-eval-portable — Design (lite)

## What changes

| File | Change |
|------|--------|
| `cli/src/harness/skill-eval-lib.mjs` | `resolveAsdd()` (the running package's `cli/bin/asdd.mjs`, two levels above this module from both `cli/src/harness` and `cli/dist/harness`); `expandProbe(run, { asdd, skillDir })` substitutes `{asdd}` / `{skill_dir}` with shell-quoted values; `loadFixtures` merges shipped + project dirs (`.harness/eval/skills/<skill>/`, same file name overrides); `requires` check → `skipped`; suite counts `skipped`; `ok` needs ≥1 executed case |
| `cli/src/harness/skill-eval.mjs` | `--fixtures <dir>` evaluates only that dir (no project merge); report prints skipped |
| `cli/eval/skills/**/*.json` | probes use `{asdd}` / `{skill_dir}`; `scope-grounding` uses `knowledge status` (portable) instead of the kit-only slice `asdd-roadmap`; `codegraph-status` declares `requires: ["command:codegraph"]`; README documents placeholders, `requires`, project fixtures |
| `package.json` | `files` ships `cli/eval/skills/**/*` |
| `cli/test/install.sh` | packed package contains the fixtures; `asdd skill-eval` passes in the installed app |
| `README.md`, `cli/README.md` | skill-eval rows/paragraph mention project fixtures |

## Decisions

- **`{asdd}` = the running CLI.** Same version as the evaluator; works in the kit, a devDependency, or a global install. A global `asdd` on PATH can be older (this machine's 3.12.0 global predates skill-eval).
- **Skip, not fail, for missing external tools.** A fixture's `requires` names what the environment must have (`command:codegraph`). An unmet requirement is a property of the machine, not of the skill text: failing would block QG-LEARN-10 on every project without that tool, and passing would hide it. `skipped` is reported with its reason and excluded from regressions.
- **Project fixtures override by file name**, so a project that adapts a kit skill can replace one case without forking the folder.

## New domain terms

None.

## ADRs

None.
