# drift-consistency — Intent

## Problem

Found while exercising the kit end to end: the knowledge graph and drift
checks disagree on which REQs exist, Semgrep's logged-out placeholder is shown
as code, mistyped feature keys are silently ignored, and DRIFT-01 blocks test
files written for a mapped requirement.

## Requirements

### REQ-001 — One REQ grammar
WHEN a slice spec defines a REQ that drift checks count (heading with or
without a body, bullet, or table row in `requirements.md` / `spec.md`) THE
system SHALL index it as a requirement node, once per document.

### REQ-002 — Real Semgrep snippets
WHEN Semgrep returns the `requires login` placeholder instead of source lines
THE system SHALL report the matched lines read from the file.

### REQ-003 — Unknown feature keys
WHEN a feature carries a key the feature schema does not define THE system
SHALL warn, naming the intended key when it is a known alias.

### REQ-004 — Tests for mapped requirements
WHEN a changed test file mentions a REQ of an editing slice THE system SHALL
treat it as mapped for DRIFT-01.

## Files

- `.harness/scripts/knowledge-lib.mjs`
- `.harness/scripts/sync-knowledge.test.mjs`
- `.harness/scripts/semgrep-lib.mjs`
- `.harness/scripts/semgrep-lib.test.mjs`
- `.harness/scripts/validators/features.mjs`
- `.harness/features/feature.schema.json`
- `.harness/scripts/drift-lib.mjs`
- `.harness/scripts/drift-lib.test.mjs`
- `.harness/steering/session-loop.md`
- `docs/architecture/spec-drift-and-audit.md`
- `scripts/test-lifecycle.sh`
- `.harness/config/versions.json`
