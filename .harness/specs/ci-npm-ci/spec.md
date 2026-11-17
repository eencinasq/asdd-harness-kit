# ci-npm-ci — Spec (hotfix)

## Intent

The `invariants` job of `.github/workflows/harness-invariants.yml` fails on `main` since 78d1fb9 (and on every PR
since): the job never installs the root dev dependencies, so `cli/test/install.sh` cannot `npm pack` (its `prepack`
build needs `esbuild` — reproduced: `Cannot find package 'esbuild'`), and the script swallows that error. Install the
root dependencies with `npm ci` before the tests, and let `install.sh` report a failed `npm pack` / global install.

Mapped: `.github/workflows/harness-invariants.yml`, `cli/test/install.sh`, `docs/knowledge-base/steering-proposals/SP-003.md`, `SP-005.md`, `SP-006.md` (applied_commit after the squash merge)

## Requirements

- **REQ-001.** The `invariants` job shall run `npm ci` at the repository root before its test steps.
- **REQ-002.** `cli/test/install.sh` shall print an error naming the step when `npm pack` or the global install of the packed tarball fails.
- **REQ-003.** Applied steering proposals shall cite an `applied_commit` that exists in `main`'s history; after the squash merge of #6 that is `fe2ed1f` (QG-LEARN-05 failed in CI with the original branch commits).
