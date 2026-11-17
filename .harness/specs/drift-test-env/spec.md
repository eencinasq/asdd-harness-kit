# drift-test-env — Spec (hotfix)

## Intent

`drift-lib.test.mjs` reads the caller's environment: with `HARNESS_DRIFT_BASE` set (as SP-004 asks parallel and
integration sessions to do), the DRIFT-07 test resolves a different base and fails (`npm test` 426/427). Tests must not
depend on the shell that runs them. Clear the drift and PR environment variables at the start of the test file.

Mapped: `cli/src/harness/drift-lib.test.mjs`

## Requirements

- **REQ-001.** `node --test cli/src/harness/drift-lib.test.mjs` shall pass whether or not `HARNESS_DRIFT_BASE`, `HARNESS_PR_BRANCH`, or `HARNESS_PR_BODY` are set in the environment.
