---
name: codegraph
description: >-
  Answers structural code questions from the codegraph index: code flows, callers, blast radius, affected tests. Use
  when exploring code or checking impact, before grep or broad reads. Do NOT use for judging code against requirements —
  use codebase-audit; or for searching specs (`asdd knowledge`).
metadata:
  tier: leaf
---

# Codegraph

Codegraph indexes the repository into `.codegraph/` and answers structural questions from the shell. One
`codegraph explore` returns the relevant symbols' source, line-numbered, with their call paths: treat that source as
already read, and open a file again only when the output says the index is stale. The rule to call it first is in
`AGENTS.md` (Working rules, "Codegraph first"); this skill is how.

**Operational boundary:** read-only on the repository; writes only the `.codegraph/` index (`codegraph sync` / `init`),
which stays out of git.

## Preconditions

- `codegraph --version` exits 0. If it is not installed, say so, fall back to Read/Grep, and point to `asdd doctor`
  (it reports the binary and the index). Setup once per developer: a `codegraph` binary on the PATH, `codegraph init`
  once per repository.
- `codegraph status --json` reports an index; if it is missing or stale, Step 1 refreshes it.
- `.harness/config/project.json` → `capabilities.codegraph`: `required: true` makes `asdd doctor` fail without it.

## Input / Output Contract

- **Inputs:** `question` (`string`, a how-does-X question, symbol names, or changed files, required); `path`
  (`path`, a sub-project to scope the query with `-p`, optional).
- **Outputs:** `answer` (`markdown`, the symbols and `file:line` locations that answer the question); `commands_run`
  (`string[]`, every codegraph command used, listed in the final message as proof the rule was followed).

## Commands

Run them from the repository root (or pass `-p <path>`).

| You want | Command |
|----------|---------|
| How X works, which code implements a feature or flow | `codegraph explore "<question or symbol names>" [--max-files N]` |
| One symbol's source with callers and callees, or a file with line numbers and dependents | `codegraph node <symbol-or-file>` |
| Find a symbol by name | `codegraph query <search>` |
| Who calls it / what it calls | `codegraph callers <symbol>` · `codegraph callees <symbol>` |
| What changes if you change it (blast radius) | `codegraph impact <symbol>` |
| Tests affected by changed files | `codegraph affected <files…>` |
| Project layout from the index | `codegraph files` |
| Is the index there and fresh | `codegraph status [--json]` |
| Update the index / build it the first time | `codegraph sync` · `codegraph init` |

Per agent, the minimum: discovery, spec, validation, domain, design — `explore` on the area before scoping, writing
REQs, or judging claims; task-planning — `explore` for real paths, `impact` for scope collisions; implementation —
`explore` (or `node`) before editing unfamiliar modules, `affected` before running tests; qa — `explore` to map REQ →
code and tests, `affected` for changed files; refactor — `impact` and `callers` before moving or renaming; knowledge —
`explore` for spikes; integration-tester (bruno) — routes and handlers; e2e-tester (playwright) — pages, components,
`data-testid`.

## Execution Protocol

### Step 1: Check the index

- **Action:** `codegraph status --json`; run `codegraph sync` when it reports stale files (`codegraph init` when there
  is no index).
- **Target:** `.codegraph/`.
- **Assertion:** `codegraph status --json` reports the index present and not stale.

### Step 2: Query

- **Action:** pick the command of the table that matches the question; start with `explore` for how-does-X.
- **Target:** the index (scoped with `-p <path>` when given).
- **Assertion:** the output names the symbols and files that answer the question; if it does not, refine the query
  once, then use Read/Grep only for the gap (configs, docs, comments, details codegraph missed).

### Step 3: Report

- **Action:** answer with `file:line` locations and list `commands_run`.
- **Target:** the final message.
- **Assertion:** every claimed location came from a codegraph output or a Read of the gap.

## Verification Gate

1. `codegraph status --json` exits 0 and reports the index not stale.
2. The final message lists at least one `codegraph` command.
3. Negative check: `git status --porcelain` shows no change this run made outside `.codegraph/`.

## Escalation Gate

HALT when `codegraph` is not installed and the project marks it `required: true` (`asdd doctor` fails): ask the
developer to install it instead of answering from Read/Grep alone. HALT when `codegraph sync` fails. Escalate as Context
→ Options → Recommendation → Decision Needed.

## Handoff & Convergence

None (terminal)
