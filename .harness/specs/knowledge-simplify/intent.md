# knowledge-simplify — Intent

## Problem

The knowledge index writes three backends (JSONL, Kuzu, SQLite). Kuzu was
archived upstream on 2025-10-10 (0.11.3 is final), and the backends have
drifted: `--embed` breaks every later sync (`UNIQUE constraint failed:
meta.key`), Kuzu vector search always fails and is swallowed, and
`knowledge_status` reports `lexical` while semantic search runs.

## Outcome

One query backend: SQLite (`node:sqlite`, optional sqlite-vec) over the
always-written JSONL projection. Failures are visible, not silently degraded.

## Requirements

### REQ-001 — Single query backend
WHEN the knowledge index is synced THE system SHALL write JSONL and, when
`node:sqlite` exists, the SQLite sidecar — and no Kuzu store.

### REQ-002 — Embedded syncs keep working
WHEN chunks carry embeddings THE system SHALL sync without error, on the first
and every later run.

### REQ-003 — Visible degradation
WHEN the server falls back (stale or broken SQLite, failed vector search,
failed query embedding) THE system SHALL report the reason in
`knowledge_status` / `knowledge_search` results and on stderr.

### REQ-004 — Accurate search mode
WHEN `knowledge_status` is called THE system SHALL report the embedded chunk
count of the backend actually serving.

## Files

- `.harness/scripts/knowledge-store.mjs`
- `.harness/scripts/knowledge-store-sqlite.mjs`
- `.harness/scripts/knowledge-store-kuzu.mjs` (removed)
- `.harness/scripts/sync-knowledge.mjs`
- `.harness/scripts/sync-knowledge.test.mjs`
- `.harness/scripts/knowledge-lib.mjs`
- `.agents/mcp/knowledge-server.mjs`
- `.harness/steering/knowledge.md`
- `.harness/config/versions.json`
- `scripts/generate-versions.mjs`
- `scripts/install-into.sh`
- `scripts/test-install-into.sh`
- `package.json`
- `package-lock.json`
- `.npmignore`
