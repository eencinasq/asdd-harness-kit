# learn-eval-gate — Design (lite)

**Author:** asdd-lite-agent
**Model/Tool:** Devin (SWE-2 Flash Medium)

## Approach

Add a proposal-eval contract check to the existing learning validator. No new command, no new files outside the
mapped set: the gate lives in `proposalFindings`' sibling — a new exported `proposalEvalFinding(root, proposal)` in
`cli/src/harness/learning-lib.mjs`, invoked from `validators/learning.mjs` so `asdd check` emits a new rule code
`QG-LEARN-10`. The steering-proposal template and `quality-gates.learn.md` document the field and the rule; the
`.harness/` copies are refreshed by `asdd kit self` (never hand-edited).

## Eval field contract

Frontmatter gains one optional field:

```yaml
eval: <command> => <result-ref>
```

- `<command>` is free text documenting what was run (e.g. `asdd skill-eval --skill asdd-status --json`).
- `<result-ref>` resolves the recorded result, either `<path>` in the worktree or `<git-ref>:<path>` read via
  `git show` (same semantics as skill-eval `--baseline`; never checks out).
- The result must be JSON matching the `asdd skill-eval --json` shape (`{ ok, failed, regressed, skills[] }`).

## Gate semantics (REQ-002/003/004)

`proposalEvalFinding` returns a finding string or `null`:

- Applies only when `change` is `add-guide` or `tighten-guide` **and** `status` is `accepted` or `applied`.
  All other change kinds and statuses (`proposed`, `rejected`) are exempt — REQ-004, and `rejected` records a
  decision not to change, so no eval is owed.
- `eval` absent or empty → FAIL: proposal accepted/applied without an eval result.
- `eval` present but result-ref unresolvable, unreadable, or not JSON → FAIL: no eval result.
- Result parsed → FAIL when `ok !== true` (covers `failed > 0` fixtures and a non-empty `regressed` delta list).
  Interpretation note: REQ-003 names "a regression"; a failing fixture is treated as regression-equivalent because
  a non-ok eval is not evidence the guide change is safe. Flagged for approval at checkpoint (b).
- `ok === true` → no finding.

The validator emits findings as `QG-LEARN-10 <file>: <reason>` FAILs, alongside the existing QG-LEARN-03/05 loop.

## Files

- `cli/src/harness/learning-lib.mjs` — `EVAL_CHANGE_TYPES`, `proposalEvalFinding`, eval-field parsing + result
  resolution (worktree path or `git show <ref>:<path>`).
- `cli/src/harness/validators/learning.mjs` — call it per proposal, `fail('QG-LEARN-10 …')`.
- `cli/src/harness/learning-lib.test.mjs` — RED-first tests (already in `npm test` script; no package.json change).
- `cli/steering/templates/steering-proposal.md` — `eval:` frontmatter line + contract comment.
- `cli/steering/quality-gates.learn.md` — QG-LEARN-10 acceptance criterion + enforcement line.
- `.harness/steering/quality-gates.learn.md`, `.harness/steering/templates/steering-proposal.md` — `asdd kit self` output.
- `cli/versions.json` — `asdd kit versions` regen (steering files are shipped artifacts); only if content changes.

No `commands.mjs`, `package.json`, or `README.md` changes — the rule extends `asdd check`, not the CLI surface.

## Scope / escalation note

All feature `scope_paths` stay under `cli/` — single top-level module, no E1. The `.harness/steering/` copies are
kit-self-generated output of the `cli/steering/` sources and are covered by the spec `Mapped:` line for DRIFT-01;
they are excluded from `scope_paths` for the same reason generated manifests are.

## Verification

- `node --test cli/src/harness/learning-lib.test.mjs` — new cases: exempt kinds/statuses, missing eval,
  unresolvable result, regressed result, ok result, `git show` ref resolution.
- `node cli/bin/asdd.mjs check --live` and `npm test` before passing and before stop.
- `asdd kit self` + `kit self --check` clean; `kit versions` only if artifact contents changed.
