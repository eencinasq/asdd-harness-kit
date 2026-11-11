/**
 * sync-knowledge.test.mjs — fixture slice → knowledge index → store queries.
 * The MCP server cases live in tools/knowledge/test/knowledge.e2e-spec.ts.
 *
 *   node --test .harness/scripts/sync-knowledge.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanKnowledge } from './knowledge-lib.mjs';
import { sqliteSupported, writeSqliteIndex } from './knowledge-store-sqlite.mjs';
import { openStore } from './knowledge-store.mjs';
import { parseRequirements } from './drift-lib.mjs';

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

// --------------------------------------------------- embeddings path
// Fake OpenAI-compatible endpoint: bag-of-words hashed into 16 dims. The
// server runs in this process, so children are spawned async (spawnSync
// would block the event loop that answers them).

const execFileAsync = promisify(execFile);

function fakeVector(text) {
  const v = new Array(16).fill(0);
  for (const w of String(text).toLowerCase().split(/\W+/)) {
    if (w) v[[...w].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 16] += 1;
  }
  return v;
}

async function withEmbeddingServer(fn) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const { input } = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: input.map((t, index) => ({ index, embedding: fakeVector(t) })) }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = {
    ...process.env,
    KNOWLEDGE_EMBEDDINGS_URL: `http://127.0.0.1:${server.address().port}/v1/embeddings`,
    KNOWLEDGE_EMBEDDINGS_MODEL: 'fake',
  };
  try {
    return await fn(env);
  } finally {
    server.close();
  }
}

async function runSyncAsync(root, extra, env) {
  const script = join(import.meta.dirname, 'sync-knowledge.mjs');
  return execFileAsync(process.execPath, [script, ...extra], { cwd: root, env, encoding: 'utf8' });
}

test('REQ-002: --embed syncs, and every later sync keeps working', { skip: !sqliteSupported() && 'node:sqlite requires Node >= 22.5' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    await withEmbeddingServer(async (env) => {
      await runSyncAsync(dir, ['--embed'], env);
      const meta = JSON.parse(readFileSync(join(dir, '.harness/knowledge/meta.json'), 'utf8'));
      assert.equal(meta.embeddings.total, meta.chunks);
      assert.ok(meta.backends.includes('sqlite'));

      // Vectors carried into later syncs: these used to fail every run after
      // --embed ("UNIQUE constraint failed: meta.key" on vec_dim).
      await runSyncAsync(dir, ['--embed'], env);
      const plain = await runSyncAsync(dir, [], env);
      assert.match(plain.stdout, /\[jsonl\+sqlite\]/);

      const store = await openStore(dir);
      assert.equal(store.backend, 'sqlite');
      assert.equal(store.counts().embedded_chunks, meta.chunks);
      store.close();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REQ-001: sync writes no Kuzu store and removes one left by kit <= 3.5', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    buildFixture(dir);
    mkdirSync(join(dir, '.harness/knowledge'), { recursive: true });
    writeFileSync(join(dir, '.harness/knowledge/kuzu'), 'old store');
    writeFileSync(join(dir, '.harness/knowledge/kuzu.meta.json'), '{}');
    const res = runSync(dir);
    assert.equal(res.status, 0, res.stderr);
    assert.doesNotMatch(res.stdout, /kuzu/);
    assert.ok(!existsSync(join(dir, '.harness/knowledge/kuzu')));
    assert.ok(!existsSync(join(dir, '.harness/knowledge/kuzu.meta.json')));
    assert.equal(runSync(dir, ['--backend=kuzu']).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REQ-001 (drift-consistency): graph indexes every REQ drift counts, once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  try {
    const slice = 'lite-slice';
    mkdirSync(join(dir, `.harness/specs/${slice}`), { recursive: true });
    writeFileSync(
      join(dir, `.harness/specs/${slice}/spec.md`),
      `# Spec

## Requirements
### REQ-001 WHEN a user requests /health THE system SHALL return 200.
### REQ-002 — Login
WHEN credentials are bad THE system SHALL return 401.
- REQ-003: WHEN the token expires THE system SHALL refresh it.
* **REQ-004** Rate limits apply per user.

| ID | Priority | Status |
|----|----------|--------|
| REQ-002 | MUST | DRAFT |
| REQ-005 | SHOULD | DRAFT |
`
    );
    // tasks.md traceability rows are references, not definitions
    writeFileSync(join(dir, `.harness/specs/${slice}/tasks.md`), '| REQ-006 | TASK-001 |\n');
    mkdirSync(join(dir, '.harness/features'), { recursive: true });
    writeFileSync(
      join(dir, `.harness/features/${slice}.features.json`),
      JSON.stringify({ schema_version: '1.0', slice_id: slice, features: [{ id: 'F-01', title: 't', status: 'in_progress', req_ids: ['REQ-001', 'REQ-003'] }] })
    );

    const { nodes, edges } = scanKnowledge(dir);
    const reqNodes = nodes.filter((n) => n.type === 'requirement' && n.slice_id === slice);
    const graphIds = reqNodes.map((n) => n.req_id).sort();
    const driftIds = parseRequirements(dir, slice).map((r) => r.id).sort();
    assert.deepEqual(graphIds, ['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004', 'REQ-005']);
    assert.deepEqual(graphIds, driftIds);

    const byId = new Map(reqNodes.map((n) => [n.req_id, n]));
    assert.equal(byId.get('REQ-002').title, 'Login', 'heading wins over the table row');
    assert.equal(byId.get('REQ-003').title, 'WHEN the token expires THE system SHALL refresh it.');
    assert.equal(byId.get('REQ-005').title, 'SHOULD');

    // No dangling IMPLEMENTS_REQ edges
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const e of edges.filter((x) => x.rel === 'IMPLEMENTS_REQ')) assert.ok(nodeIds.has(e.to), e.to);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('knowledge-query.mjs answers status, search, trace, slice and patterns from the index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asdd-knowledge-'));
  const query = (...args) =>
    spawnSync(process.execPath, [join(import.meta.dirname, 'knowledge-query.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  try {
    buildFixture(dir);
    const none = query('status');
    assert.equal(none.status, 1);
    assert.match(none.stdout, /no knowledge index/);

    assert.equal(runSync(dir, ['--backend=jsonl']).status, 0);
    const status = JSON.parse(query('status').stdout);
    assert.equal(status.backend, 'jsonl');
    assert.equal(status.search_mode, 'lexical');

    const search = query('search', 'deposit', 'confirms', '--k', '1');
    assert.equal(search.status, 0, search.stderr);
    const { results, search_mode } = JSON.parse(search.stdout);
    assert.equal(search_mode, 'lexical');
    assert.equal(results.length, 1);
    assert.match(results[0].text, /deposit/i);
    assert.equal(results[0].embedding, undefined);

    const trace = JSON.parse(query('trace', `feature:${SLICE}:F-02`, '--depth', '1').stdout);
    assert.equal(trace.found, true);
    assert.ok(trace.nodes.some((n) => n.id === 'file:src/wallet/deposits.ts'));

    const slice = JSON.parse(query('slice', SLICE).stdout);
    assert.deepEqual(slice.requirements.map((r) => r.id).sort(), [`req:${SLICE}:REQ-001`, `req:${SLICE}:REQ-002`]);
    assert.equal(slice.features.length, 2);

    assert.equal(query('patterns').status, 0);
    assert.equal(query('patterns', '--status', 'bogus').status, 1);
    assert.equal(query('search').status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
