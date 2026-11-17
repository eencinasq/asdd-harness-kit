# metrics-data-quality — Spec (hotfix)

## Intent

`asdd status --metrics` (and the same data in `--json`, `--html`, and the `asdd ui` Pipeline view) shows noise:
`stop FAILs … by code` lists message fragments (`<path>×3`, a whole `lite slice "*" cannot complete …` message) next to
real codes, because `stopFailCounts` takes everything before the first `:` of a learning signature as the code, and
signatures of FAIL lines without a check code are message shapes. The `Active Slices` table also lists `ABANDONED`
slices and misaligns ids longer than 18 characters. Count uncoded signatures under `other`; hide abandoned slices
(with a count); size the id column to the longest id. Learning signatures themselves do not change.

Out of scope: phase medians near 0 h come from session timestamps written in bulk, not from the computation;
`telemetry-emitters` brings real spans.

Mapped: `cli/src/harness/pipeline-metrics.mjs`, `cli/src/harness/pipeline-metrics.test.mjs`, `cli/src/harness/harness-status.mjs`, `tools/knowledge/src/harness/pipeline-metrics.mjs` (vendored copies, `asdd kit vendor`)

## Requirements

- **REQ-001.** `stop_fail.by_code` shall key only check codes (`DRIFT-01`, `QG-LEARN-04`, …) and count every other sensor signature under `other`.
- **REQ-002.** The `Active Slices` table shall omit `ABANDONED` slices and state how many it omitted.
- **REQ-003.** The `Active Slices` id column shall be as wide as the longest listed slice id.
