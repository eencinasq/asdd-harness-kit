# guidance-proposal-skip — Spec (hotfix)

## Intent

`asdd kit guidance` FAILs `stale` on `docs/knowledge-base/profiling-proposals/v2.md:88`, a historical proposal that
quotes `codegraph_explore`. The scanner already skips `docs/knowledge-base/steering-proposals/` (records that never
ship), but not its siblings `profiling-proposals/` and `rules-proposals/`, which `package.json` `files[]` also excludes.
Add both prefixes to `SKIP_PREFIXES`; historical proposal text is not rewritten.

Mapped: `cli/src/kit/guidance.mjs`

## Requirements

- **REQ-001.** `asdd kit guidance` shall not scan `docs/knowledge-base/profiling-proposals/` or `docs/knowledge-base/rules-proposals/`, as it already does not scan `docs/knowledge-base/steering-proposals/`.
