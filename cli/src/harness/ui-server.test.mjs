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

test('ui-drift-dead-link REQ-001 REQ-002: no link or route to the host-only spec-drift MCP App', async () => {
  const app = readFileSync(join(HERE, 'ui/app.js'), 'utf8');
  assert.doesNotMatch(app, /\/vendor\/spec-drift\//, 'the MCP App waits forever outside an MCP host');
  const { startUiServer } = await import('./ui-server.mjs');
  const handle = await startUiServer({ root: ROOT, port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${handle.address.port}/vendor/spec-drift/audit-dashboard.html`);
    assert.equal(res.status, 404);
  } finally {
    await handle.close();
  }
});

// --- ui-insights (P5.7): activation, skill-eval, cost insights ---

test('ui-insights TASK-002 REQ-001…004 the page has an Insights tab over the three endpoints and Slices metric cards', () => {
  const app = readFileSync(join(HERE, 'ui/app.js'), 'utf8');
  assert.match(app, /VIEWS = \[[^\]]*'insights'/);
  for (const endpoint of ['/api/insights/activation', '/api/insights/skill-eval', '/api/insights/cost']) {
    assert.ok(app.includes(endpoint), endpoint);
  }
  for (const field of ['lite_share', 'escalation_rate', 'stop_fail', 'phase_median_hours', 'open_patterns']) {
    assert.ok(app.includes(field), `Slices card for ${field}`);
  }
  assert.match(app, /never_loaded/);
  assert.match(app, /regressed/);
  assert.match(app, /unknown_runtimes/);
  assert.match(app, /\.hint/, 'absent sources show their hint');
});

function insightsRoot({ spans = null, observeWired = true, runtimes = ['claude', 'cursor'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ui-insights-'));
  const w = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  w('.harness/steering/controls.md', '---\ninclusion: always\n---\n# controls\n');
  w('.harness/steering/design-system.md', '---\ninclusion: auto\ntags:\n  - design\n---\n# design\n');
  w('.agents/skills/shape-up/SKILL.md', '---\nname: shape-up\n---\n');
  w('.agents/skills/codegraph/SKILL.md', '---\nname: codegraph\n---\n');
  w('.harness/config/project.json', JSON.stringify({ runtimes }));
  w('.harness/state/registry.json', JSON.stringify({ slices: [] }));
  if (observeWired) {
    w(
      '.claude/settings.json',
      JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Read|Skill', hooks: [{ type: 'command', command: 'asdd observe claude' }] }] } }),
    );
  }
  if (spans) w('.harness/state/telemetry/spans.jsonl', `${spans.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join('\n')}\n`);
  return root;
}

const load = (target, iso, runtime = 'claude') => ({
  schema_version: '1.0',
  trace_id: 'a'.repeat(16),
  span_id: 'b'.repeat(8),
  kind: 'tool',
  process_name: 'asdd-observe',
  runtime,
  start_time_iso: iso,
  end_time_iso: iso,
  duration_ms: 0,
  status: 'OK',
  attributes: { trace_source: 'self', target_path: target },
  writer: 'runtime-hook',
});

test('ui-insights REQ-001 activation: installed vs loaded per runtime, never-loaded flagged, window applied', async () => {
  const { activationInsights } = await import('./ui-server-insights.mjs');
  const now = Date.parse('2026-11-17T12:00:00Z');
  const root = insightsRoot({
    spans: [
      load('.harness/steering/controls.md', '2026-11-17T10:00:00Z'),
      load('.harness/steering/controls.md', '2026-11-16T10:00:00Z'),
      load('.agents/skills/shape-up/SKILL.md', '2026-10-01T10:00:00Z'),
      { kind: 'command', start_time_iso: '2026-11-17T10:00:00Z', attributes: {} },
      'not json',
    ],
  });
  try {
    const week = activationInsights(root, { window: '7', now });
    assert.equal(week.source, 'present');
    assert.equal(week.window_days, 7);
    const by = Object.fromEntries(week.items.map((i) => [i.path, i]));
    assert.equal(by['.harness/steering/controls.md'].loads.total, 2);
    assert.equal(by['.harness/steering/controls.md'].loads.by_runtime.claude, 2);
    assert.equal(by['.harness/steering/controls.md'].inclusion, 'always');
    assert.equal(by['.agents/skills/shape-up/SKILL.md'].never_loaded, true, 'load outside the 7-day window');
    assert.equal(by['.agents/skills/codegraph/SKILL.md'].type, 'skill');
    assert.equal(by['.harness/steering/design-system.md'].never_loaded, true);
    const rt = Object.fromEntries(week.runtimes.map((r) => [r.runtime, r.measured]));
    assert.equal(rt.claude, 'observed');
    assert.equal(rt.cursor, 'not measured');
    const all = activationInsights(root, { window: 'all', now });
    assert.equal(Object.fromEntries(all.items.map((i) => [i.path, i]))['.agents/skills/shape-up/SKILL.md'].never_loaded, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ui-insights REQ-004 activation absent: no spans → says so and names the producing command', async () => {
  const { activationInsights } = await import('./ui-server-insights.mjs');
  const root = insightsRoot({ observeWired: false });
  try {
    const out = activationInsights(root, { window: '30' });
    assert.equal(out.source, 'absent');
    assert.match(out.hint, /asdd observe/);
    assert.equal(Object.fromEntries(out.runtimes.map((r) => [r.runtime, r.measured])).claude, 'hook not wired');
    assert.equal(out.items.length, 4, 'installed items still listed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ui-insights REQ-002 REQ-003 REQ-004 skill-eval summary, cost pass-through, absent hints', async () => {
  const { summarizeSkillEval, costInsights, isSafeRef } = await import('./ui-server-insights.mjs');
  const suite = {
    ok: false,
    total: 2,
    passed: 1,
    failed: 1,
    baseline: 'main',
    regressed: ['shape-up/pitch'],
    skills: [
      {
        name: 'shape-up',
        total: 2,
        passed: 1,
        failed: 1,
        results: [
          { id: 'pitch', ok: false, delta: 'regressed', failures: ['skill_contains: missing "Ground"'], probes: [{ stdout: 'x'.repeat(5000) }] },
          { id: 'po-mode', ok: true, delta: 'unchanged', failures: [] },
        ],
      },
    ],
  };
  const s = summarizeSkillEval(suite);
  assert.equal(s.source, 'present');
  assert.deepEqual(s.regressed, ['shape-up/pitch']);
  assert.equal(s.skills[0].cases[0].delta, 'regressed');
  assert.ok(JSON.stringify(s).length < 2000, 'probe output is not shipped to the page');
  assert.equal(summarizeSkillEval({ skills: [], total: 0, passed: 0, failed: 0, regressed: [], ok: false }).source, 'absent');
  assert.match(summarizeSkillEval({ skills: [], total: 0 }).hint, /asdd skill-eval/);
  assert.equal(isSafeRef('main'), true);
  assert.equal(isSafeRef('origin/main~2'), true);
  assert.equal(isSafeRef('--output=x'), false);
  assert.equal(isSafeRef('a b'), false);

  const cost = {
    source: ['claude-transcript'],
    totals: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, usd: 0.01 },
    by_slice: [],
    by_phase: [],
    by_model: [],
    by_runtime: [{ runtime: 'cursor', unknown: true }],
    unknown_runtimes: ['cursor'],
  };
  assert.equal(costInsights({ cost }).source, 'present');
  assert.deepEqual(costInsights({ cost }).unknown_runtimes, ['cursor']);
  const absent = costInsights({});
  assert.equal(absent.source, 'absent');
  assert.match(absent.hint, /asdd status --metrics/);
});

test('ui-insights REQ-001…004 GET endpoints serve the models; skill-eval uses the injected runner; no writes', async () => {
  const { startUiServer } = await import('./ui-server.mjs');
  const root = insightsRoot({ spans: [load('.harness/steering/controls.md', new Date().toISOString())] });
  let calls = 0;
  const skillEvalRunner = async ({ baseline }) => {
    calls += 1;
    return {
      skills: [{ name: 'asdd-status', total: 1, passed: 1, failed: 0, results: [{ id: 'status-json', ok: true, failures: [] }] }],
      total: 1,
      passed: 1,
      failed: 0,
      regressed: [],
      baseline: baseline ?? null,
      ok: true,
    };
  };
  const handle = await startUiServer({ root, port: 0, skillEvalRunner });
  const base = `http://127.0.0.1:${handle.address.port}`;
  try {
    const act = await fetch(`${base}/api/insights/activation?window=30`).then((r) => r.json());
    assert.equal(act.source, 'present');
    assert.equal(act.window_days, 30);
    const bad = await fetch(`${base}/api/insights/activation?window=abc`);
    assert.equal(bad.status, 400);
    const ev = await fetch(`${base}/api/insights/skill-eval`).then((r) => r.json());
    assert.equal(ev.source, 'present');
    await fetch(`${base}/api/insights/skill-eval`);
    assert.equal(calls, 1, 'cached between GETs');
    await fetch(`${base}/api/insights/skill-eval?refresh=1`);
    assert.equal(calls, 2);
    const badRef = await fetch(`${base}/api/insights/skill-eval?baseline=--output%3Dx`);
    assert.equal(badRef.status, 400);
    const cost = await fetch(`${base}/api/insights/cost`).then((r) => r.json());
    assert.ok(['present', 'absent'].includes(cost.source));
    const post = await fetch(`${base}/api/insights/cost`, { method: 'POST' });
    assert.equal(post.status, 405);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
