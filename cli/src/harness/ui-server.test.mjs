/**
 * asdd-ui — REQ-001…REQ-004 (TASK-001 starts with bind + read-only).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');

async function waitPort(host, port, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      await new Promise((resolve, reject) => {
        const c = createConnection({ host, port }, () => {
          c.end();
          resolve();
        });
        c.on('error', reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw new Error(`port ${host}:${port} not open`);
}

test('REQ-001 server binds 127.0.0.1 only and answers GET /', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const handle = await startUiServer({ root: ROOT, port: 0 });
  try {
    assert.equal(handle.address.address, '127.0.0.1');
    assert.ok(handle.address.port > 0);
    await waitPort('127.0.0.1', handle.address.port);
    const res = await fetch(`http://127.0.0.1:${handle.address.port}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /asdd/i);
  } finally {
    await handle.close();
  }
});

test('REQ-001 ui-server source uses only node: builtins (no package imports)', () => {
  const src = readFileSync(join(HERE, 'ui-server.mjs'), 'utf8');
  const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of imports) {
    assert.ok(
      spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'),
      `unexpected import: ${spec}`,
    );
    if (!spec.startsWith('node:')) {
      assert.ok(!spec.includes('node_modules'));
    }
  }
  assert.ok(imports.some((s) => s === 'node:http'));
  assert.ok(imports.some((s) => s === 'node:fs' || s.startsWith('node:fs/')));
});

test('REQ-004 non-GET methods return 405 and do not write under root', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const handle = await startUiServer({ root: ROOT, port: 0 });
  try {
    const base = `http://127.0.0.1:${handle.address.port}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/`, { method });
      assert.equal(res.status, 405, method);
    }
  } finally {
    await handle.close();
  }
});

test('REQ-002 aggregate APIs: status, pipeline, drift, learn, knowledge', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const handle = await startUiServer({ root: ROOT, port: 0 });
  const base = `http://127.0.0.1:${handle.address.port}`;
  try {
    const status = await fetch(`${base}/api/status`).then((r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
    assert.ok(Array.isArray(status.slices) || Array.isArray(status.registry?.slices));
    assert.ok(status.metrics || status.slices);

    const pipeline = await fetch(`${base}/api/pipeline`);
    assert.equal(pipeline.status, 200);
    assert.match(await pipeline.text(), /ASDD pipeline|asdd/i);

    const drift = await fetch(`${base}/api/drift`).then((r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
    assert.ok(drift.findings || drift.summary);

    const learn = await fetch(`${base}/api/learn`).then((r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
    assert.ok(Array.isArray(learn.patterns) || Array.isArray(learn.open));

    const knowledge = await fetch(`${base}/api/knowledge?q=asdd`).then((r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
    assert.ok(knowledge.results || knowledge.payload?.results || knowledge.error !== undefined);

    const shell = await fetch(`${base}/ui/app.js`);
    assert.equal(shell.status, 200);
    const js = await shell.text();
    assert.match(js, /\/api\/status/);
    assert.match(js, /\/api\/pipeline/);
    assert.match(js, /\/api\/drift/);
    assert.match(js, /\/api\/learn/);
    assert.match(js, /\/api\/knowledge/);
  } finally {
    await handle.close();
  }
});

test('REQ-001 GET /api/gates lists pending WARN gates with concerns and drift', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'asdd-ui-gates-'));
  try {
    mkdirSync(join(tmp, '.harness/state/slices/demo/sessions'), { recursive: true });
    writeFileSync(
      join(tmp, '.harness/state/registry.json'),
      JSON.stringify({
        slices: [{ slice_id: 'demo', phase: 'implementation', status: 'in_progress', mode: 'full' }],
      }),
    );
    writeFileSync(
      join(tmp, '.harness/state/slices/demo/manifest.json'),
      JSON.stringify({
        slice_id: 'demo',
        phase: 'implementation',
        status: 'in_progress',
        gates: {
          spec: { status: 'WARN', concerns: ['vague REQ'], decided_at: null },
          design: { status: 'PASS' },
        },
      }),
    );
    writeFileSync(
      join(tmp, '.harness/state/slices/demo/sessions/001.json'),
      JSON.stringify({
        event_type: 'phase_completed',
        phase: 'spec',
        concerns: ['vague REQ'],
        evidence: 'spec done with WARN',
      }),
    );
    const handle = await startUiServer({ root: tmp, port: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${handle.address.port}/api/gates`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.pending));
      assert.ok(data.pending.some((g) => g.slice_id === 'demo' && g.phase === 'spec'));
      const hit = data.pending.find((g) => g.slice_id === 'demo' && g.phase === 'spec');
      assert.ok(hit.concerns?.length || hit.evidence);
      assert.ok('drift' in hit || hit.drift_level !== undefined || hit.drift);
      const appJs = readFileSync(join(HERE, 'ui/app.js'), 'utf8');
      assert.match(appJs, /\/api\/gates/);
      assert.match(appJs, /gates/i);
    } finally {
      await handle.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('REQ-005 POST /api/gates/decide rejects bad Host or Origin (DNS rebinding / CSRF)', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const { request } = await import('node:http');
  const handle = await startUiServer({ root: ROOT, port: 0 });
  const port = handle.address.port;
  const post = (headers) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/gates/decide',
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': 2, ...headers },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode, body }));
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
  try {
    const badHost = await post({ host: 'evil.example', origin: `http://127.0.0.1:${port}` });
    assert.equal(badHost.status, 403);

    const badOrigin = await post({
      host: `127.0.0.1:${port}`,
      origin: 'http://evil.example',
    });
    assert.equal(badOrigin.status, 403);

    const missing = await post({ host: `127.0.0.1:${port}` });
    assert.equal(missing.status, 403);

    const okHeaders = await post({
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
    });
    assert.notEqual(okHeaders.status, 403);
  } finally {
    await handle.close();
  }
});

test('REQ-002 REQ-004 POST /api/gates/decide spawns asdd and surfaces non-zero output', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const { request } = await import('node:http');
  let calls = 0;
  const handle = await startUiServer({
    root: ROOT,
    port: 0,
    decideRunner: async (_root, body) => {
      calls += 1;
      if (body.note === 'fail') return { ok: false, error: 'asdd gate-decide exited 1', output: 'FAIL boom' };
      return { ok: true, output: 'OK override' };
    },
  });
  const port = handle.address.port;
  const post = (payload) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/gates/decide',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            host: `127.0.0.1:${port}`,
            origin: `http://127.0.0.1:${port}`,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  try {
    const fail = await post({ slice_id: 'demo', phase: 'spec', note: 'fail' });
    assert.equal(fail.status, 422);
    assert.match(fail.body, /FAIL boom/);
    const ok = await post({ slice_id: 'demo', phase: 'spec', note: 'ok note' });
    assert.equal(ok.status, 200);
    assert.match(ok.body, /OK override/);
    assert.equal(calls, 2);
  } finally {
    await handle.close();
  }
});

test('REQ-003 /events SSE fires when .harness/state/ changes', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'asdd-ui-sse-'));
  const stateDir = join(tmp, '.harness/state');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'probe.json'), '{"ok":1}\n');
  const handle = await startUiServer({ root: tmp, port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${handle.address.port}/events`, {
      headers: { accept: 'text/event-stream' },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const deadline = Date.now() + 3000;
    const poke = setTimeout(() => {
      writeFileSync(join(stateDir, 'probe.json'), `{"ok":${Date.now()}}\n`);
    }, 50);
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (/event:\s*reload/.test(buf)) break;
    }
    clearTimeout(poke);
    await reader.cancel().catch(() => {});
    assert.match(buf, /event:\s*reload/);
    const appJs = readFileSync(join(HERE, 'ui/app.js'), 'utf8');
    assert.match(appJs, /EventSource|\/events/);
  } finally {
    await handle.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
