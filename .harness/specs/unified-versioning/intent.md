# unified-versioning — Intent

## Problem

Each installed artifact carried its own hand-bumped version. The installer
refreshes a client file only when its version changes, so a file edited
without a bump (or bumped to a version already installed) silently stays
stale in client projects. The regenerate path kept old versions by comparing
mtimes, which also misses changes.

## Requirements

### REQ-001 — One version
WHEN the versions manifest is generated THE system SHALL stamp every artifact
installed into client projects, and `kit_version`, with the project version
from `package.json`.

### REQ-002 — One bump
WHEN a release is bumped THE system SHALL set the project version in
`package.json` and `package-lock.json` and restamp every artifact.

### REQ-003 — Guarded
WHEN any artifact version differs from the project version THE system SHALL
fail the kit test suite.

## Files

- `scripts/generate-versions.mjs`
- `scripts/test-install-into.sh`
- `scripts/install-into.sh`
- `.harness/config/versions.json`
- `package.json`
- `package-lock.json`
