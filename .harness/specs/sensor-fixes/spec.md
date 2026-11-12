# sensor-fixes — Spec (lite)

## Intent

Two sensor defects found while closing spec-drift-apps. (1) `evidence_hash` counts a file deleted from the working tree
but still in git's index as `<missing>`; committing the deletion removes it from the listing, the hash changes with no
content change, and DRIFT-02 reopens a passing feature. (2) The spec-drift e2e `analyze_spec_drift runs through the
service` sets `ANALYSIS_REPO_ROOT` and `PR_REVIEW_ROOT` after `AppModule` is imported, when `ConfigModule.forRoot` has
already read the environment: the analyzer scans the server's own folder (no `.semgrep/`) and PR-review artifacts may
land in the developer's real state folder.

## Requirements

- **REQ-001.** The project file listing used by scope paths shall leave out files deleted from the working tree, so a feature's `evidence_hash` changes when a file is deleted and not again when the deletion is committed.
- **REQ-002.** The spec-drift in-memory MCP e2e shall configure `ANALYSIS_REPO_ROOT` and `PR_REVIEW_ROOT` before the application's configuration is read, so `analyze_spec_drift` scans the test's sandbox repository and passes.

## Out of scope

Re-stamping existing features: no file is currently deleted-but-indexed (`git ls-files --deleted` is empty), so no recorded hash changes.
