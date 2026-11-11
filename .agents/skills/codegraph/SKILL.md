---
name: codegraph
description: >-
  Code intelligence from the codegraph CLI: explore an area, a symbol's callers
  and callees, a change's impact, affected tests. Use before grep or broad
  reads to explore code, map requirements to code, or check blast radius.
---

# Codegraph

Codegraph indexes the repository into `.codegraph/` and answers structural questions from the shell. Call it **before**
grep/Read loops: one `codegraph explore` returns the relevant symbols' source, line-numbered, with their call paths. Treat
that source as already read; open a file again only when the output says the index is stale.

## Commands

Run them from the repository root (or pass `-p <path>`).

| You want | Command |
|----------|---------|
| How does X work, which code implements a feature or flow | `codegraph explore "<question or symbol names>" [--max-files N]` |
| One symbol's source with its callers and callees, or a file with line numbers and dependents | `codegraph node <symbol-or-file>` |
| Find a symbol by name | `codegraph query <search>` |
| Who calls it / what it calls | `codegraph callers <symbol>` · `codegraph callees <symbol>` |
| What changes if you change it (blast radius) | `codegraph impact <symbol>` |
| Tests affected by changed files | `codegraph affected <files…>` |
| Project layout from the index | `codegraph files` |
| Is the index there and fresh | `codegraph status [--json]` |
| Update the index after edits / build it the first time | `codegraph sync` · `codegraph init` |

## Rules

1. **Codegraph first** for how-does-X, architecture, flows, impact, and before editing unfamiliar modules.
2. **Fallback** to Read/Grep only for configs, docs, comments, or details codegraph missed.
3. **List** the codegraph commands you ran in your final message (it proves the rule was followed).
4. **Stale or missing index:** run `codegraph sync` (or `codegraph init` once). If `codegraph` is not installed, say so,
   fall back to Read/Grep, and point to `asdd doctor`, which reports the binary and the index.

## Per-agent minimum

| Agent | Minimum |
|-------|---------|
| discovery, spec, validation, domain, design | `codegraph explore` on the area before scoping, writing REQs, or judging claims |
| task-planning | `codegraph explore` for real file paths and dependencies; `codegraph impact` for scope collisions |
| implementation | `codegraph explore` (or `node`) before edits in unfamiliar modules; `codegraph affected` before running tests |
| qa | `codegraph explore` to map REQ-NNN → code and tests; `codegraph affected` for the changed files |
| refactor | `codegraph impact` and `callers` before moving or renaming |
| knowledge | `codegraph explore` for spikes and dependency analysis |
| integration-tester (bruno) | `codegraph explore` for routes, controllers, handlers |
| e2e-tester (playwright) | `codegraph explore` for pages, components, `data-testid` |

## Setup (once per developer)

```bash
npm install -g codegraph   # or put a codegraph binary on the PATH
codegraph init             # once per repository: builds .codegraph/
asdd doctor                # reports the codegraph version and whether .codegraph/ exists
```

`.harness/config/project.json` → `capabilities.codegraph` says whether the project relies on it (`required: true` makes
`asdd doctor` fail without it). Keep `.codegraph/` out of git.
