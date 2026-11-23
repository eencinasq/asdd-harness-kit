# Design: mutation testing as a coverage sensor

Design version: 1.1.0 · Status: READY · Requirements version: 1.1.0 (validation v1.1 PASS)
Owner: orchestrator (main session) · Date: 2026-11-23

## Components

| Component | File | Role |
|---|---|---|
| `asdd mutate` | `cli/src/harness/mutate.mjs` (new) | Sensor: resolve the features' non-test source files, run the bound command once, classify the exit. Exports `mutationTargets()` and `runMutation()` (pure apart from the injected runner) and `run(argv)` (CLI, `runMain` footer). |
| Command entry | `cli/registry/contribution-points.json` → `commands.harness.mutate` | `--slice <id>` (required), `--feature <TASK-NNN>`, `--json`; help and completion are generated from it. |
| Binding slot | `cli/templates/bindings/quality-gates.project.md` (+ the kit's own copy) | `Mutation command: \`…\`` under "Spec drift and audit bindings", read with `readBinding()` like `Contract command`. |
| Skill | `cli/skills/mutation-testing/SKILL.md` (new, tier leaf) | What to do with each survivor (REQ-007); hands off to `test-driven-development`. |
| QA rule | `cli/agents/asdd-qa-agent.md` | Coverage counts only with `pass` or recorded equivalents (REQ-008). |
| Shell exception | `.semgrep/standards/js.yml` `std.no-shell-true` | `mutate.mjs` joins the listed runners of a project's bound commands. |

## Data flow (`asdd mutate --slice S [--feature F] [--json]`)

1. `parseCommand('mutate', argv)`; missing `--slice`, unknown slice or feature → `UsageError`, exit 2 (REQ-005). The
   features and files are computed before the binding is read, so `features` and `files` are filled for every status
   (AMB-012).
2. Binding: `readBinding(root, '.harness/steering/quality-gates.project.md', 'Mutation command')[0]`. None →
   `unconfigured`, exit 0, nothing run (REQ-003). `readBinding` already drops `…` and empty values.
3. Features: the slice's features with status `in_progress` or `passing` (or only `F`). Files:
   `scopeFiles(root, normalized scope_paths)` minus test files (`testFileMatcher(root)`), minus `harnessManaged(root)`
   and exempt paths (`isExempt`, `drift-lib.mjs:143-158`, AMB-011), minus non-code files by extension (`.md .mdx .json .yml .yaml .toml .txt .lock .svg .png
   .jpg .gif .csv .html .css`), deduplicated and sorted. Empty → `no-files`, exit 0 (REQ-004).
4. Command: every `{files}` is replaced by the POSIX single-quoted paths joined by spaces. A command without
   `{files}` runs unchanged (the tool's own configuration decides what to mutate) — the report says so.
5. Run once with `spawnSync(command, { shell: true, cwd: root, timeout: 30 min, maxBuffer: 64 MB })`: exit 0 →
   `pass` (exit 0); non-zero or timeout → `survivors` (exit 1) (REQ-001). The output tail is the last 4000 characters
   of stdout + stderr.
6. `--json` → `{ status, slice, features, files, command, exit_code, output_tail }` (REQ-006); text otherwise:
   `PASS|FAIL|SKIP  mutation — <status>; <n> file(s); <command>`.

## Decisions

- **D-1 Exit-code contract, no report parsing.** Same as `Contract command` and `Audit commands`: the project wraps
  its tool so "non-zero = a mutant survived" (Stryker `thresholds.break: 100`, PIT `mutationThreshold=100`, mutmut
  `run` then `results` piped to a check). Parsing Stryker/PIT/mutmut reports would tie the kit to tool versions.
- **D-2 `unconfigured` exits 0.** A missing binding is reported as "not a pass" but does not fail `asdd check` or CI;
  the QA gate (REQ-008) is where it is weighed. Consistent with `asdd audit` (`unconfigured (not a pass)`).
- **D-3 Not part of `asdd check`.** Mutation runs take minutes; `check` runs on every stop hook. The sensor is an
  explicit command that QA and the skill call.
- **D-4 `shell: true` with quoted paths.** The binding is project-owned steering (trusted like `Audit commands`); the
  substituted paths come from `scope_paths` and are single-quoted, so a path cannot inject a command.

## Validation v1.1 findings answered here

- **AMB-009** The skill classifies a survivor in this order: equivalent (REQ-012), then dead code (REQ-011), then a
  missing behavior test (REQ-010); an eval case covers dead code inside a MUST feature file.
- **AMB-010** The skill's loop ends on `pass`; on `unconfigured` or `no-files` it records the result and stops; on
  `error` it stops and escalates.
- **ACT-001** `QG-SPEC-11` also makes QA list every disable comment added in the slice's feature files, with its
  reason, in `spec-coverage-report.md`; a disable without a reason leaves its requirement uncovered.
- **TRC-002** `asdd kit self` copies `cli/steering/quality-gates.exec.md` to `.harness/steering/` (its `--check` runs
  in `npm test`).
- **RSK-001** The 30-minute limit stays fixed; an `error` result names the files, and the binding slot warns that a
  tool which mutates files in place (mutmut) can leave a mutant behind when killed — run it on a clean tree.

## Traceability

| REQ | Where |
|---|---|
| REQ-001…008 | `mutate.mjs` + `cli/src/harness/mutate.test.mjs` (one test per REQ) |
| REQ-009 | registry entry + `cli/test/full-pipeline.sh` smoke run |
| REQ-010…013 | `cli/skills/mutation-testing/SKILL.md` + `cli/eval/skills/mutation-testing/*.json` (REQ-016) |
| REQ-014 | `QG-SPEC-11` in `cli/steering/quality-gates.exec.md` + `cli/agents/asdd-qa-agent.md`; a registry test asserts both |
| REQ-015 | binding template slot; a registry test asserts it |

## Risks

- R-1: A tool that cannot take a file list → the project binds it without `{files}`; documented in the slot.
- R-2: Long runs in CI → `asdd mutate` is opt-in; no hook runs it.
