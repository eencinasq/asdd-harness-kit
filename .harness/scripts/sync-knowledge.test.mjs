/**
 * sync-knowledge.test.mjs — fixture slice → knowledge index → MCP queries.
 *
 *   node --test .harness/scripts/sync-knowledge.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanKnowledge } from './knowledge-lib.mjs';
import { sqliteSupported, writeSqliteIndex } from './knowledge-store-sqlite.mjs';
import { kuzuAvailable, writeKuzuIndex } from './knowledge-store-kuzu.mjs';
import { openStore } from './knowledge-store.mjs';

const SLICE = 'test-slice';

function buildFixture(root) {
  mkdirSync(join(root, `.harness/specs/${SLICE}`), { recursive: true });
  writeFileSync(
    join(root, `.harness/specs/${SLICE}/requirements.md`),
    `# Requirements: ${SLICE}

## EARS Requirements

### REQ-001 — Poker hand evaluation
**Universal:** The system shall evaluate poker hands deterministically.

### REQ-002 — Deposit crediting
**Event-driven:** When a deposit confirms on-chain, the system shall credit the player's balance.
`
  );

  mkdirSync(join(root, '.harness/features'), { recursive: true });
  writeFileSync(
    join(root, `.harness/features/${SLICE}.features.json`),
    JSON.stringify({
      schema_version: '1.0',
      slice_id: SLICE,
      source_tasks: `.harness/specs/${SLICE}/tasks.md`,
      features: [
        {
          id: 'F-01',
          title: 'Hand evaluator',
          user_visible_behavior: 'Players see correct hand rankings',
          status: 'passing',
          priority: 1,
          verification: ['unit tests pass'],
          evidence: '42 tests green',
          req_ids: ['REQ-001'],
          scope_paths: ['src/poker/evaluator.ts'],
        },
        {
          id: 'F-02',
          title: 'Deposit watcher',
          user_visible_behavior: 'Balance updates after confirmation',
          status: 'in_progress',
          priority: 2,
          verification: ['e2e deposit flow'],
          req_ids: ['REQ-002'],
          depends_on: ['F-01'],
          scope_paths: ['src/wallet/deposits.ts'],
        },
      ],
    })
  );

  mkdirSync(join(root, `.harness/state/slices/${SLICE}/sessions`), { recursive: true });
  writeFileSync(
    join(root, `.harness/state/slices/${SLICE}/manifest.json`),
    JSON.stringify({ schema_version: '3.0', slice_id: SLICE, phase: 'implementation', status: 'in_progress', mode: 'lite' })
  );
  writeFileSync(
    join(root, `.harness/state/slices/${SLICE}/sessions/001.json`),
    JSON.stringify({
      session_id: 's-001',
      event_type: 'feature_started',
      phase: 'implementation',
      agent: 'asdd-implementation-agent',
      timestamp: '2026-10-12T00:00:00Z',
      feature_id: 'F-02',
      scope_paths: ['src/wallet/deposits.ts'],
      summary: 'Started deposit watcher; on-chain confirmations arrive via webhook',
    })
  );
}

function runSync(root, extra = []) {
  const script = join(import.meta.dirname, 'sync-knowledge.mjs');
  return spawnSync(process.execPath, [script, ...extra], { cwd: root, encoding: 'utf8' });
}

function mcp(root, messages) {
  const server = join(import.meta.dirname, '../../.agents/mcp/knowledge-server.mjs');
  const res = spawnSync(process.execPath, [server], {
    cwd: root,
    input: messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    encoding: 'utf8',
  });
  return res.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test('scanKnowledge builds nodes/edges/chunks from fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    const { nodes, edges, chunks, stats } = scanKnowledge(dir);

    const nodeIds = new Set(nodes.map((n) => n.id));
    assert.ok(nodeIds.has(`slice:${SLICE}`));
    assert.ok(nodeIds.has(`req:${SLICE}:REQ-001`));
    assert.ok(nodeIds.has(`req:${SLICE}:REQ-002`));
    assert.ok(nodeIds.has(`feature:${SLICE}:F-01`));
    assert.ok(nodeIds.has(`feature:${SLICE}:F-02`));
    assert.ok(nodeIds.has('file:src/poker/evaluator.ts'));
    assert.ok(nodeIds.has('file:src/wallet/deposits.ts'));

    const edgeSet = new Set(edges.map((e) => `${e.from}|${e.rel}|${e.to}`));
    assert.ok(edgeSet.has(`slice:${SLICE}|HAS_FEATURE|feature:${SLICE}:F-01`));
    assert.ok(edgeSet.has(`feature:${SLICE}:F-01|IMPLEMENTS_REQ|req:${SLICE}:REQ-001`));
    assert.ok(edgeSet.has(`feature:${SLICE}:F-02|DEPENDS_ON|feature:${SLICE}:F-01`));
    assert.ok(edgeSet.has(`feature:${SLICE}:F-02|OWNS|file:src/wallet/deposits.ts`));

    assert.ok(chunks.some((c) => c.text.includes('poker hands deterministically')));
    assert.ok(stats.chunks > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-knowledge.mjs writes the index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    const res = runSync(dir);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /WRITE \.harness\/knowledge\//);
    assert.ok(existsSync(join(dir, '.harness/knowledge/nodes.jsonl')));
    assert.ok(existsSync(join(dir, '.harness/knowledge/edges.jsonl')));
    assert.ok(existsSync(join(dir, '.harness/knowledge/chunks.jsonl')));
    assert.ok(existsSync(join(dir, '.harness/knowledge/meta.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('knowledge-server answers status, search, trace, slice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    assert.equal(runSync(dir).status, 0);

    const responses = mcp(dir, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'knowledge_status', arguments: {} } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'deposit balance confirms' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'knowledge_trace', arguments: { id: `req:${SLICE}:REQ-001`, depth: 2 } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'knowledge_slice', arguments: { slice_id: SLICE } } },
    ]);
    const byId = new Map(responses.map((r) => [r.id, r]));
    const payload = (id) => JSON.parse(byId.get(id).result.content[0].text);

    const status = payload(2);
    assert.ok(status.chunks > 0);
    assert.equal(status.search_mode, 'lexical');
    assert.ok(['jsonl', 'sqlite', 'kuzu'].includes(status.backend));

    const search = payload(3);
    assert.ok(search.results.length > 0);
    assert.ok(search.results[0].text.includes('deposit') || search.results[0].text.includes('Deposit'));

    const trace = payload(4);
    assert.equal(trace.found, true);
    const traced = new Set(trace.nodes.map((n) => n.id));
    assert.ok(traced.has(`feature:${SLICE}:F-01`));

    const bundle = payload(5);
    assert.equal(bundle.slice.slice_id, SLICE);
    assert.equal(bundle.requirements.length, 2);
    assert.equal(bundle.features.length, 2);
    assert.equal(bundle.sessions, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite backend: write + serve via openStore', { skip: !sqliteSupported() && 'node:sqlite requires Node >= 22.5' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    const { nodes, edges, chunks } = scanKnowledge(dir);
    const meta = { generated_at: '2099-01-01T00:00:00Z', nodes: nodes.length };

    mkdirSync(join(dir, '.harness/knowledge'), { recursive: true });
    writeFileSync(join(dir, '.harness/knowledge/meta.json'), JSON.stringify(meta));
    writeSqliteIndex(dir, { nodes, edges, chunks, meta });

    const store = await openStore(dir);
    assert.ok(store, 'openStore should return a backend');
    assert.equal(store.backend, 'sqlite');

    const counts = store.counts();
    assert.equal(counts.nodes, nodes.length);
    assert.equal(counts.edges, edges.length);
    assert.equal(counts.chunks, chunks.length);

    // trace via sqlite edgesIncident
    const incident = store.edgesIncident(`feature:${SLICE}:F-02`);
    assert.ok(incident.some((e) => e.rel === 'DEPENDS_ON' && e.to === `feature:${SLICE}:F-01`));
    assert.ok(incident.some((e) => e.rel === 'OWNS' && e.to === 'file:src/wallet/deposits.ts'));

    // slice bundle via sqlite nodesBySlice
    const reqs = store.nodesBySlice(SLICE).filter((n) => n.type === 'requirement');
    assert.equal(reqs.length, 2);
    assert.ok(store.nodeById(`slice:${SLICE}`));

    store.close();

    // Stale sidecar → falls back to JSONL (or null when no JSONL written)
    writeFileSync(join(dir, '.harness/knowledge/meta.json'), JSON.stringify({ ...meta, generated_at: '2099-02-02T00:00:00Z' }));
    const store2 = await openStore(dir);
    assert.notEqual(store2?.backend, 'sqlite', 'stale sqlite must not be served');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kuzu backend: write + serve via openStore', { skip: !kuzuAvailable() && 'kuzu package not installed' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    const { nodes, edges, chunks } = scanKnowledge(dir);
    const meta = { generated_at: '2099-01-01T00:00:00Z', nodes: nodes.length };

    mkdirSync(join(dir, '.harness/knowledge'), { recursive: true });
    writeFileSync(join(dir, '.harness/knowledge/meta.json'), JSON.stringify(meta));
    await writeKuzuIndex(dir, { nodes, edges, chunks, meta });

    const store = await openStore(dir);
    assert.ok(store, 'openStore should return a backend');
    assert.equal(store.backend, 'kuzu');

    const counts = await store.counts();
    assert.equal(counts.nodes, nodes.length);
    assert.equal(counts.edges, edges.length);
    assert.equal(counts.chunks, chunks.length);

    const incident = await store.edgesIncident(`feature:${SLICE}:F-02`);
    assert.ok(incident.some((e) => e.rel === 'DEPENDS_ON' && e.to === `feature:${SLICE}:F-01`));
    assert.ok(incident.some((e) => e.rel === 'OWNS' && e.to === 'file:src/wallet/deposits.ts'));

    const reqs = (await store.nodesBySlice(SLICE)).filter((n) => n.type === 'requirement');
    assert.equal(reqs.length, 2);
    assert.ok(await store.nodeById(`slice:${SLICE}`));

    // Stale store → falls back
    writeFileSync(join(dir, '.harness/knowledge/meta.json'), JSON.stringify({ ...meta, generated_at: '2099-02-02T00:00:00Z' }));
    const store2 = await openStore(dir);
    assert.notEqual(store2?.backend, 'kuzu', 'stale kuzu store must not be served');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
