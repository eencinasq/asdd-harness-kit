# full-flow-fixture — Spec (hotfix)

## Intent

`npm run test:full-flow` fails on `main` and on the integration branch: the fixture slice `order-flow` maps feature
f1 to `src/checkout` only, but f1 also writes `test/reorder.test.mjs` (its tasks.md says "src/checkout/reorder.js +
test"), so DRIFT-01 correctly reports the test file as unmapped. Add the test file to f1's `scope_paths`.

Mapped: `cli/test/full-flow.sh`

## Requirements

- **REQ-001.** `npm run test:full-flow` shall pass: feature f1's `scope_paths` shall cover every file it changes, including `test/reorder.test.mjs`.
