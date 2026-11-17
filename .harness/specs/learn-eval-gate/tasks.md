# learn-eval-gate — Tasks

> Planned during Task Planning phase.

Branch carry-over (mapped context — landed on `feat/skill-eval` by prior work, not authored by this slice;
listed so DRIFT-01 accounts for the stacked-branch diff vs `main`): `docs/ASDD-ROADMAP.md` (P5 base branch
content), `docs/knowledge-base/steering-proposals/SP-004.md`, `docs/knowledge-base/steering-proposals/SP-005.md`
(filed by slice skill-eval, DONE).

Generated vendor output of `cli/src/harness/learning-lib.mjs` (refreshed by `asdd kit vendor`, committed with the
source change): `tools/spec-drift/src/harness/learning-lib.mjs`, `tools/jev-gate/src/harness/learning-lib.mjs`,
`tools/knowledge/src/harness/learning-lib.mjs`.

- [ ] **TASK-001** — `proposalEvalFinding` in `cli/src/harness/learning-lib.mjs`: parse `eval:` frontmatter
      (`<command> => <result-ref>`), resolve result-ref (worktree path or `git show <ref>:<path>`), assess
      skill-eval JSON (`ok !== true` → finding). RED-first tests in `learning-lib.test.mjs` covering exempt
      change kinds/statuses, missing/malformed eval, unresolvable result, regressed and ok results.
      Verify: `node --test cli/src/harness/learning-lib.test.mjs`
      Mapped: `cli/src/harness/learning-lib.mjs`, `cli/src/harness/learning-lib.test.mjs`

- [ ] **TASK-002** — Wire the gate: `validators/learning.mjs` calls `proposalEvalFinding` per proposal and emits
      `QG-LEARN-10` FAILs. Test that an accepted add-guide proposal without eval FAILs `asdd check` while a
      loosen-sensor proposal stays clean.
      Verify: `node --test cli/src/harness/learning-lib.test.mjs` + `node cli/bin/asdd.mjs check`
      Mapped: `cli/src/harness/validators/learning.mjs`, `cli/src/harness/learning-lib.test.mjs`

- [ ] **TASK-003** — Docs + shipped copies: add `eval:` to `cli/steering/templates/steering-proposal.md`, add
      QG-LEARN-10 to `cli/steering/quality-gates.learn.md`, run `asdd kit self` to refresh `.harness/` copies, run
      `asdd kit versions` only if artifact contents changed.
      Verify: `node cli/bin/asdd.mjs kit self --check` + `npm test`
      Mapped: `cli/steering/quality-gates.learn.md`, `cli/steering/templates/steering-proposal.md`,
      `.harness/steering/quality-gates.learn.md`, `.harness/steering/templates/steering-proposal.md`,
      `cli/versions.json`
