---
inclusion: auto
tags:
  - implementation
  - qa
  - refactor
  - review
---

# Spec drift and audit

Spec drift is the gap between what a slice says and what the repository does. The harness checks it with one library (`drift-lib.mjs` in the asdd CLI) behind three entry points, so the stop hook, CI, and chat give the same answer. Agents and skills use the scripts; the MCP server is for people in chat:

| Entry point | When | Who |
|-------------|------|-----|
| `asdd check` (Verify-on-Stop, CI) | Every agent stop and every push | Automatic |
| `asdd drift [--json] [--base <ref>]` | On demand | Agents, engineers, and the Tech Lead |
| MCP server `spec-drift` (vendors `drift-lib.mjs`) | In chat, with an optional dashboard | People: engineers and the Tech Lead |

Checks `DRIFT-00`…`DRIFT-07` and their gates `QG-DRIFT-01`…`05` are defined in [quality-gates.md](./quality-gates.md). This file does not restate them. Design: [README → spec drift and audit](https://github.com/eencinasq/asdd-harness-kit#spec-drift-and-codebase-audit).

## Engineers (author)

1. Before marking a feature `passing`: run `asdd drift`. Fix every `fail`. (In chat, the MCP tool `audit_diff`, mode `author`, gives the same answer.)
2. A `DRIFT-01` (unmapped file) means one of two things: the change is out of scope (revert it), or the slice is missing the file (map it in `intent.md`, `design.md`, `tasks.md`, `spec.md`, or the feature's `scope_paths`). Never map a file only to silence the check.
3. After the verification passes, set `passing` with `evidence` and run `asdd sync`: it records the feature's `evidence_hash` ([session-loop.md](./session-loop.md)). No commit is needed. Later edits to owned files reopen the feature (`DRIFT-02`).
4. At `qa`, `asdd drift --slice <id> --requirements` shows which MUST requirements lack a feature or a test that names the REQ ID (DRIFT-03/04). In chat, `verify_spec_compliance` adds the project's contract adapters.
5. Branch as `slice/<slice-id>/<topic>` or put `Slice: <slice-id>` in the PR body (`DRIFT-07`).

## Tech Lead (review)

1. Review a PR with `asdd drift --base <base> --target <head> --pr-branch <branch> --pr-body "<body>"` (adds DRIFT-07). In chat, the `pr-review` prompt or `audit_diff` mode `review` also applies TL triage.
2. Findings are drafts for review comments. The dashboard's "Draft comment" and "Dismiss…" only send chat messages; nothing is posted or written by the server.
3. Dismiss a finding with `asdd triage <id> --dismiss --reason "<why>"`. The dismissal lasts until the finding's files change. Confirm inferential findings with `--confirm` before they count.
4. Run `asdd audit` on a schedule (runner open: [`.github/workflows/harness-audit.yml.example`](../../.github/workflows/harness-audit.yml.example)) and the `codebase-audit` skill for the inferential pass. The audit runs the same Semgrep scan as the MCP tool `verify_architecture_rules` and writes each problem with its fix to `.harness/audits/<timestamp>.json` (`audit_report` shows it on the dashboard in chat). A finding seen three times triggers `QG-DEB-06`.
5. The TL owns the rules: steering, bindings, and sensors (example: [`.github/CODEOWNERS.harness.example`](../../.github/CODEOWNERS.harness.example)).

## Bindings

Set in [quality-gates.project.md](./quality-gates.project.md): `Test file globs`, `Drift base branch`, `Audit commands`, `Contract command`, `OpenAPI spec`. The architecture check loads [domain-layer.md](./domain-layer.md), [domain-layer.project.md](./domain-layer.project.md), [product.md](./product.md), [structure.md](./structure.md), and [tech.md](./tech.md). Those last four are project bindings: the installing app fills them, and `project.json` `bindings` can point at another path in the repo. A file that still says `(stub)` is unfilled and is not product truth. The check then selects Semgrep rules: the `Semgrep rules` binding, else `.semgrep.yml` (or `.semgrep.yaml`, `semgrep.yml`, `.semgrep/architecture.yml`, or a `.semgrep/architecture/` folder with rules — where the spec-drift MCP prompt `generate-architecture-rules` asks the agent to write them from the codebase). If none of those exist, it generates a temporary config from a `Paths | Must not import` table in the specs and the `Language` row in `tech.md`, and runs `semgrep scan --json`. Generated YAML is not written into the repo. Findings include Semgrep's fix when the rule provides one. A missing `semgrep` binary is `unavailable`, not a pass. The `Gate command` in the domain-layer project binding still runs when it is set. An unfilled command and no Semgrep rules are reported as `unconfigured`, never as a pass. Set `Drift base branch` to the branch slices merge into (for example `origin/develop`); the default `origin/HEAD` usually points at `main`, so every commit in `develop` that `main` lacks would count as slice drift.

Files the kit installer refreshes are listed in `managed_files` in `.harness/config/installed-versions.json`, and drift ignores them: a kit upgrade is not slice work.

`drift.contract` in `.harness/config/project.json` sets whether missing `scope_paths` or `evidence` warns or fails (`DRIFT-06`).
