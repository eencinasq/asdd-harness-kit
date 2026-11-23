# mutation-testing — Requirements

Spec version: 1.1.0 · Status: READY
Changes from 1.0.0: answers spec-validation-report.md v1.0 (CON-001…004, AMB-001…008, TRC-001, EARS-001). Tech Lead
decisions 2026-11-23 (eencinas): the QA rule is a new gate criterion `QG-SPEC-11` (CON-002); the `Mutation command`
slot is optional — unfilled means `unconfigured`, recorded as INFO, never a pass and never a block (CON-003).

## Definitions

- **Feature files** of a set of features: the files that exist in the working tree (tracked, or untracked and not
  ignored by git) and match the features' `scope_paths`, minus files matching the `Test file globs` binding (or its
  default), minus `.harness/` and other harness-managed paths, minus documentation and data files (extensions `.md`,
  `.mdx`, `.txt`, `.json`, `.yml`, `.yaml`, `.toml`, `.lock`, `.csv`, `.svg`, `.png`, `.jpg`, `.gif`, `.html`, `.css`),
  deduplicated and sorted.
- **Selected features:** with `--feature`, that one feature whatever its status; otherwise the slice's features with
  status `in_progress` or `passing`.

## `asdd mutate`

The command evaluates, in this order: REQ-005, REQ-003, REQ-004, then the run (REQ-001).

- **REQ-001 (MUST).** When `asdd mutate --slice <id>` runs with `Mutation command` bound and at least one feature file,
  the system shall run the first bound value once through the shell, in the repository root, with each `{files}`
  replaced by the feature files as POSIX single-quoted paths joined by spaces, and shall report `pass` with exit 0 when
  the command exits 0, or `survivors` with exit 1 when it exits non-zero.
- **REQ-002 (MUST).** When `--feature <TASK-NNN>` is given with `--slice`, the system shall use only that feature's
  files.
- **REQ-003 (MUST).** If `Mutation command` is unfilled (`…`), empty, or absent, then the system shall report
  `unconfigured`, shall print `unconfigured (not a pass)` in its text output, shall not run anything, and shall exit 0.
- **REQ-004 (MUST).** If the selected features have no feature file, then the system shall report `no-files`, shall
  not run the command, and shall exit 0.
- **REQ-005 (MUST).** If `--slice` is missing, the slice does not exist, or the feature does not exist in the slice,
  then the system shall print the problem with the command's usage and exit 2.
- **REQ-006 (MUST).** If the bound command cannot be started or runs longer than 30 minutes, then the system shall
  report `error` and exit 2.
- **REQ-007 (MUST).** If the bound command contains no `{files}`, then the system shall run it unchanged and shall
  report `files_substituted: false`.
- **REQ-008 (MUST).** When `--json` is given, the system shall print one JSON object with `status`, `slice`,
  `features`, `files`, `files_substituted`, `command` (after substitution), `exit_code`, and `output_tail` (stdout, a
  newline, and stderr, keeping the last 4000 characters), with `null` for `command`, `exit_code`, and `output_tail`
  when nothing ran, and shall keep the exit codes of REQ-001…REQ-006.
- **REQ-009 (MUST).** The `mutate` command shall be declared in the registry (`args`/`flags`, so its help and
  completion are generated) and run by the full-pipeline e2e in an installed project.

## Skill `mutation-testing`

- **REQ-010 (MUST).** When a surviving mutant is in a file of a feature with a MUST requirement, the skill shall direct
  the agent to add or strengthen a behavior test through the `test-driven-development` skill.
- **REQ-011 (MUST).** When the surviving mutant is in code no requirement or caller needs, the skill shall direct the
  agent to delete that dead code.
- **REQ-012 (MUST).** When the surviving mutant does not change observable behavior (equivalent), the skill shall
  direct the agent to mark it in the source with the mutation tool's inline disable comment carrying the reason
  (Stryker `// Stryker disable next-line <mutator>: <reason>`, mutmut `# pragma: no mutate`, PIT exclusions), and to
  cite that line in the feature's `evidence`.
- **REQ-013 (MUST).** The skill shall direct the agent to run `asdd mutate` again after each change until it reports
  `pass`, and to write the final result into the feature's `evidence`.

## Gate and binding

- **REQ-014 (MUST).** The QA gate shall carry `QG-SPEC-11` in `quality-gates.exec.md`: when `Mutation command` is
  bound, a MUST requirement counts as covered only when `asdd mutate` for its features reports `pass`; `survivors` or
  `error` leaves it uncovered (`UNCOV-NNN`); `unconfigured` and `no-files` are recorded as INFO and change no coverage.
  The QA agent shall apply it.
- **REQ-015 (MUST).** The `quality-gates.project.md` binding template shall carry an optional `Mutation command` slot in
  "Spec drift and audit bindings" that documents `{files}`, the non-zero-on-survivors contract, and examples for
  Stryker, mutmut, and PIT.
- **REQ-016 (SHOULD).** Skill-eval fixtures shall pin REQ-010…REQ-013, one case per behavior (survivor → test, dead
  code, equivalent, re-run).
