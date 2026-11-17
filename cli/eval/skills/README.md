# Skill eval fixtures

`asdd skill-eval` runs every fixture in this folder (shipped in the npm package) plus the project's own fixtures, and
reports a pass rate per skill. It is deterministic: fixtures assert on exit codes, output, files, and the skill text,
never on a model's opinion. It works the same in the kit checkout and in an installed project.

```bash
asdd skill-eval                          # every skill with fixtures
asdd skill-eval --skill asdd-status      # one skill
asdd skill-eval --baseline main          # also compare with the skill body at a git ref
asdd skill-eval --json                   # machine-readable (QG-LEARN-10 evidence)
```

It exits non-zero when a fixture fails or, with `--baseline`, when a fixture regresses. A case whose `requires` is
not met is reported as `SKIP` with the reason; it never fails the run or counts as a regression, but a run where every
case was skipped is not a pass. `--fixtures <dir>` evaluates only that directory.

## Layout

One folder per skill, named like the skill (`cli/skills/<name>/`), with one JSON file per case:

```
cli/eval/skills/
  asdd-status/status-json.json
  asdd-status/status-table.json
```

## Project fixtures

A project adds cases for its own skills, or replaces a shipped case for a kit skill it adapted, under
`.harness/eval/skills/<skill>/<case>.json` (same format). A project file with the same name as a shipped one
(`.harness/eval/skills/asdd-status/status-json.json`) overrides it; any other name adds a case. Results carry
`source: kit | project`.

## A fixture

```json
{
  "id": "status-json",
  "task": "Report pipeline health as JSON for a dashboard",
  "expect": "`asdd status --json` exits 0 and prints a JSON document with a slices summary",
  "setup": { "notes/input.md": "optional file for the temporary workspace" },
  "probes": [
    { "id": "p1", "run": "{asdd} status --json", "cwd": "repo" }
  ],
  "assertions": [
    { "type": "exit_code", "probe": "p1", "code": 0 },
    { "type": "stdout_matches", "probe": "p1", "pattern": "\"slices\"" },
    { "type": "skill_contains", "pattern": "asdd status" }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Case name (defaults to the file name) |
| `task`, `expect` | The task the skill serves and the observable outcome, in words |
| `setup` | Files written into a temporary workspace before the probes; paths cannot leave it |
| `probes` | Shell commands. `cwd: "repo"` runs at the project root, `"work"` (default) in the temporary workspace. 30 s timeout each. Placeholders: `{asdd}` is the asdd CLI running the evaluation (same version, kit checkout or installed package); `{skill_dir}` is the evaluated skill's folder (`cli/skills/<name>` in the kit, `.agents/skills/<name>` in a project) |
| `requires` | Optional. What the environment must have: `command:<name>` (on PATH) or `path:<repo-relative path>`. Unmet → the case is skipped with the reason |
| `assertions` | Checks on the probes, the workspace, and the skill text (below) |

| Assertion `type` | Checks |
|---|---|
| `exit_code` | A probe's exit code (`probe`, `code`) |
| `stdout_contains` | A probe's stdout contains literal text (`probe`, `text`) |
| `stdout_matches` | A probe's stdout matches a regex (`probe`, `pattern`) |
| `file_exists` | A workspace file exists (`path`) |
| `file_contains` | A workspace file contains `pattern`, as literal text or as a regex (`path`, `pattern`) |
| `skill_contains` / `skill_lacks` | The skill's `SKILL.md` contains / does not contain literal text (`pattern`) |

## Baseline

`--baseline <ref>` reads the skill body at that ref with `git show <ref>:<path>` (no checkout) and scores each fixture
again with it: `improved`, `regressed`, or `unchanged`. Only `skill_*` assertions see the old text; probes always run
the current code.

## Trust

Probes run with a shell. Review fixtures like any script in the repository; do not run fixtures from an untrusted
branch.
