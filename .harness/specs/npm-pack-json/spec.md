# npm-pack-json — Spec (hotfix)

## Intent

`npm test` fails in `cli/test/install.sh`: `npm pack --dry-run --json` runs the `prepack` script (`npm run build`),
whose stdout line `OK cli/dist (… modules …)` lands before the JSON, so `JSON.parse` throws
`Unexpected token 'O', "OK cli/dis"... is not valid JSON`. The file-list check does not need a build; pass
`--ignore-scripts` to that dry run only. The real `npm pack` later in the test keeps running `prepack`.

Mapped: `cli/test/install.sh`

## Requirements

- **REQ-001.** The package-contents check in `cli/test/install.sh` shall parse the `npm pack --dry-run --json` output without lifecycle-script output mixed into stdout.
