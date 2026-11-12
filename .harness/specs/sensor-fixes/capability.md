# Capability: Sensor fixes (sensor-fixes)

## Category
BUGFIX

## Scope
- Pitch ID: ad-hoc (follow-ups recorded when spec-drift-apps closed)
- Scope ID: none — one slice
- Scope class: must_have

## Problem Statement
Two sensors report something that did not happen. DRIFT-02 reopens a passing feature when a file deletion inside a
directory scope is committed: the file listing still had the deleted file (git's index), hashed it as `<missing>`, and
the commit removes it from the listing with no content change. The spec-drift in-memory MCP e2e fails
`analyze_spec_drift` because it sets its sandbox environment after the configuration was read; the analyzer scans the
server's own folder, and PR-review artifacts can land in the developer's real state folder.

## Actors
- Kit maintainer: runs `asdd check`, `npm test`, and the spec-drift suites.
- Squad agent or developer: records `passing` features that DRIFT-02 compares.

## Entities
- Evidence hash: sha256 over the path and content of the files a feature's `scope_paths` cover.
- Project file listing: tracked and untracked-not-ignored files (git), or a filesystem walk outside git.

## Out of Scope
Re-stamping recorded hashes (none changes: no file is deleted-but-indexed). Other e2e files (they override providers
instead of reading the environment).
