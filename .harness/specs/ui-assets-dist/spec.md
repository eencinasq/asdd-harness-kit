# ui-assets-dist — Spec (hotfix)

## Intent

`asdd ui` (slice asdd-ui) answers 404 on `/`: `cli/src/kit/build.mjs` compiles only `.mjs` sources into `cli/dist`,
so the static UI (`cli/src/harness/ui/index.html`, `app.js`, `styles.css`) never reaches `cli/dist/harness/ui/`, and
the npm package ships `cli/dist` only. The unit tests import from `src/`, so they did not see it. Copy non-module
assets under `cli/src` into `cli/dist` on build, and include them in the source fingerprint so editing an asset marks
`dist/` stale.

Mapped: `cli/src/kit/build.mjs`, `cli/src/kit/fingerprint.mjs`, `cli/test/install.sh`

## Requirements

- **REQ-001.** `asdd kit build` shall copy every non-`.mjs`, non-test file under `cli/src` to the same relative path under `cli/dist`.
- **REQ-002.** The source fingerprint shall cover those assets, so a changed asset makes `cli/dist` stale.
- **REQ-003.** The installed npm package shall contain `cli/dist/harness/ui/index.html`, `app.js`, and `styles.css`.
