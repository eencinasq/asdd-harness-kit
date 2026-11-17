# ci-npm-ci — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** The `invariants` job shall run `npm ci` at the repository root before its test steps.
- **REQ-002.** `cli/test/install.sh` shall print an error naming the step when `npm pack` or the global install of the packed tarball fails.
