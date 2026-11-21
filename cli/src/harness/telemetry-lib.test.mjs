/**
 * telemetry-emitters TASK-003 — telemetry-lib span core: ids, buildSpan, fail-open emit, validateSpan, readTail.
 * REQ-001…REQ-006, REQ-022. TASK-004 — policy: attribute(), guidanceTarget(), skillTarget() (REQ-015, REQ-017).
 * TASK-011 — profile model: phaseMarkers, percentile, surfaceScores, activationRows, profileModel (REQ-020, REQ-021).
 * Every case runs in a temp dir, never against the repo's .harness/state/ (the kit repo has several in_progress slices).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ATTRIBUTION_ENV,
  MAX_LINE_BYTES,
  STREAM_FILE,
  TAIL_MAX_BYTES,
  TAIL_MAX_LINES,
  TELEMETRY_DIR,
  attribute,
  buildSpan,
  childOf,
  emit,
  guidanceTarget,
  mintSpan,
  synthesizePhaseSpans,
  readTail,
  skillTarget,
  startTrace,
  validateSpan,
} from './telemetry-lib.mjs';
// TASK-011 exports are read through the namespace so a missing export fails its own cases only.
import * as telemetryLib from './telemetry-lib.mjs';
import { detectionSpan, evaluateHeuristics } from './telemetry-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = join(HERE, 'telemetry-lib.mjs');
const SCHEMA_PATH = join(HERE, '../../../.harness/state/telemetry/telemetry.schema.json');
// Plan-level constant (tasks.md rule 6): the schema file is fixed.
const SCHEMA_SHA256 = '14ffba1c44513a5d32a106d3345ba6ee62361009d26f446c4c6471e9e0853a1c';
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

/** Temp repo root; `withDir` creates the telemetry location. */
function tempRoot(withDir = true) {
  const root = mkdtempSync(join(tmpdir(), 'asdd-telemetry-'));
  if (withDir) mkdirSync(join(root, TELEMETRY_DIR), { recursive: true });
  return root;
}

function streamPath(root) {
  return join(root, TELEMETRY_DIR, STREAM_FILE);
}

function sampleSpan(fields = {}) {
  return buildSpan(startTrace({ env: {} }), { kind: 'command', process_name: 'command-gate', status: 'OK', ...fields });
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Runs fn with stdout/stderr writes counted and exitCode watched. */
function silent(fn) {
  const before = process.exitCode;
  const out = mock.method(process.stdout, 'write', () => true);
  const err = mock.method(process.stderr, 'write', () => true);
  let result;
  try {
    result = fn();
  } finally {
    out.mock.restore();
    err.mock.restore();
  }
  assert.equal(out.mock.callCount(), 0, 'emit wrote to stdout');
  assert.equal(err.mock.callCount(), 0, 'emit wrote to stderr');
  assert.equal(process.exitCode, before, 'emit changed process.exitCode');
  return result;
}

test('constants match design §3.1', () => {
  assert.equal(TELEMETRY_DIR, '.harness/state/telemetry');
  assert.equal(STREAM_FILE, 'spans.jsonl');
  assert.equal(MAX_LINE_BYTES, 4096);
  assert.equal(TAIL_MAX_LINES, 500);
  assert.equal(TAIL_MAX_BYTES, 262144);
  assert.equal(ATTRIBUTION_ENV, 'HARNESS_SLICE_ID');
});

// --- REQ-001: one span is one append-mode line ---

test('REQ-001 emit appends one LF-terminated line and keeps earlier bytes (prefix hash)', () => {
  const root = tempRoot();
  try {
    const first = sampleSpan();
    assert.equal(emit(first, { root }), true);
    const before = readFileSync(streamPath(root));
    assert.equal(before.toString('utf8'), `${JSON.stringify(first)}\n`);
    const second = sampleSpan({ process_name: 'sync-state', kind: 'sync' });
    assert.equal(emit(second, { root }), true);
    const after = readFileSync(streamPath(root));
    assert.equal(sha(after.subarray(0, before.length)), sha(before));
    assert.equal(after.subarray(before.length).toString('utf8'), `${JSON.stringify(second)}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 emit opens in append mode with exactly one write and closes the fd', () => {
  const root = tempRoot();
  const open = mock.method(fs, 'openSync');
  const write = mock.method(fs, 'writeSync');
  const close = mock.method(fs, 'closeSync');
  try {
    assert.equal(emit(sampleSpan(), { root }), true);
    assert.equal(open.mock.callCount(), 1);
    assert.equal(open.mock.calls[0].arguments[1], 'a');
    assert.equal(write.mock.callCount(), 1);
    assert.equal(close.mock.callCount(), 1);
  } finally {
    open.mock.restore();
    write.mock.restore();
    close.mock.restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 20 concurrent child processes produce 20 parseable, schema-valid lines', async () => {
  const root = tempRoot();
  try {
    const url = pathToFileURL(LIB_PATH).href;
    const runs = Array.from({ length: 20 }, (_, i) => {
      const code = `import { emit, buildSpan, startTrace } from ${JSON.stringify(url)};
const span = buildSpan(startTrace({ env: {} }), { kind: 'command', process_name: 'p${i}', attributes: { pad: 'y'.repeat(3500) } });
process.exit(emit(span, { root: ${JSON.stringify(root)} }) ? 0 : 1);`;
      return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' });
        child.on('exit', (status) => resolve(status));
      });
    });
    const statuses = await Promise.all(runs);
    assert.deepEqual(statuses, Array(20).fill(0));
    const text = readFileSync(streamPath(root), 'utf8');
    assert.ok(text.endsWith('\n'));
    const lines = text.slice(0, -1).split('\n');
    assert.equal(lines.length, 20);
    const names = new Set();
    for (const line of lines) {
      const span = JSON.parse(line);
      assert.deepEqual(validateSpan(span, SCHEMA), []);
      names.add(span.process_name);
    }
    assert.equal(names.size, 20);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-001 REQ-002 missing location returns false and creates no directory', () => {
  const root = tempRoot(false);
  try {
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
    assert.equal(existsSync(join(root, '.harness')), false);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- REQ-002 / REQ-003: fail-open matrix ---

test('REQ-002 read-only directory returns false', { skip: IS_ROOT && 'root ignores chmod' }, () => {
  const root = tempRoot();
  const dir = join(root, TELEMETRY_DIR);
  try {
    chmodSync(dir, 0o555);
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
    assert.equal(existsSync(streamPath(root)), false);
  } finally {
    chmodSync(dir, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 read-only stream file returns false and leaves it unchanged', { skip: IS_ROOT && 'root ignores chmod' }, () => {
  const root = tempRoot();
  try {
    writeFileSync(streamPath(root), 'earlier\n');
    chmodSync(streamPath(root), 0o444);
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
    assert.equal(readFileSync(streamPath(root), 'utf8'), 'earlier\n');
  } finally {
    chmodSync(streamPath(root), 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 stream path is a directory (EISDIR) returns false', () => {
  const root = tempRoot();
  try {
    mkdirSync(streamPath(root));
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 REQ-003 oversized line writes nothing and returns false; exactly 4096 B is accepted', () => {
  const root = tempRoot();
  try {
    const base = sampleSpan({ attributes: { pad: '' } });
    const baseBytes = Buffer.byteLength(JSON.stringify(base)) + 1;
    const fits = { ...base, attributes: { ...base.attributes, pad: 'x'.repeat(MAX_LINE_BYTES - baseBytes) } };
    const over = { ...base, attributes: { ...base.attributes, pad: 'x'.repeat(MAX_LINE_BYTES - baseBytes + 1) } };
    assert.equal(silent(() => emit(over, { root })), false);
    assert.equal(existsSync(streamPath(root)), false);
    assert.equal(silent(() => emit(fits, { root })), true);
    assert.equal(statSync(streamPath(root)).size, MAX_LINE_BYTES);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 circular object and non-object arguments return false without throwing', () => {
  const root = tempRoot();
  try {
    const circular = sampleSpan();
    circular.attributes.self = circular;
    for (const bad of [circular, null, undefined, 42, 'span', true, [], () => {}, Symbol('s')]) {
      assert.equal(silent(() => emit(bad, { root })), false);
    }
    assert.equal(existsSync(streamPath(root)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-005 reserved attributes and forbidden kinds return false', () => {
  const root = tempRoot();
  try {
    for (const key of ['heuristic', 'trigger_span_id', 'source']) {
      const span = sampleSpan();
      span.attributes[key] = key === 'heuristic' ? 'H-BOOT' : key === 'trigger_span_id' ? 'abcdef01' : 'session_events';
      assert.equal(silent(() => emit(span, { root })), false, key);
    }
    for (const kind of ['phase', 'turn', 'subagent', 'test']) {
      assert.equal(silent(() => emit(sampleSpan({ kind }), { root })), false, kind);
    }
    assert.equal(existsSync(streamPath(root)), false);
    for (const writer of ['asdd-span', 'runtime-hook']) {
      for (const kind of ['turn', 'subagent']) {
        assert.equal(silent(() => emit(sampleSpan({ kind, writer }), { root })), true, `${writer} ${kind}`);
      }
      assert.equal(silent(() => emit(sampleSpan({ kind: 'phase', writer }), { root })), false, `${writer} phase`);
    }
    for (const kind of ['command', 'sensor', 'hook', 'sync', 'tool']) {
      assert.equal(silent(() => emit(sampleSpan({ kind }), { root })), true, kind);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 a throwing write or short write returns false and the fd is still closed', () => {
  const root = tempRoot();
  const close = mock.method(fs, 'closeSync');
  try {
    const boom = mock.method(fs, 'writeSync', () => {
      throw new Error('EIO');
    });
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
    boom.mock.restore();
    const short = mock.method(fs, 'writeSync', () => 1);
    assert.equal(silent(() => emit(sampleSpan(), { root })), false);
    short.mock.restore();
    assert.equal(close.mock.callCount(), 2);
  } finally {
    close.mock.restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-002 emit is synchronous: returns a boolean, never a promise', () => {
  const root = tempRoot();
  try {
    const ok = emit(sampleSpan(), { root });
    const bad = emit(null, { root });
    assert.equal(typeof ok, 'boolean');
    assert.equal(typeof bad, 'boolean');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-003 1,000 emits of 300–4,096 B each grow the stream by their line length; p99 <= 50 ms', () => {
  const root = tempRoot();
  try {
    const N = 1000;
    const base = sampleSpan({ attributes: { pad: '' } });
    const baseBytes = Buffer.byteLength(JSON.stringify(base)) + 1;
    const samples = [];
    let size = 0;
    // A schema-complete span is already ~350 B, so the smallest line is max(300, base span).
    const low = Math.max(300, baseBytes);
    let seed = 7;
    for (let i = 0; i < N; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const target = i === 0 ? low : i === 1 ? MAX_LINE_BYTES : low + (seed % (MAX_LINE_BYTES - low + 1));
      const span = { ...base, attributes: { ...base.attributes, pad: 'x'.repeat(target - baseBytes) } };
      const t0 = process.hrtime.bigint();
      const ok = emit(span, { root });
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
      assert.equal(ok, true, `emit ${i} did not append`);
      const next = statSync(streamPath(root)).size;
      assert.equal(next - size, target, `emit ${i} grew the stream by ${next - size}, expected ${target}`);
      size = next;
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.ceil(0.99 * N) - 1];
    // Printed for the feature evidence (REQ-003 measured p99).
    console.log(`# REQ-003 emit p99 = ${p99.toFixed(3)} ms over ${N} emits (max ${samples[N - 1].toFixed(3)} ms)`);
    assert.ok(p99 <= 50, `p99 ${p99} ms > 50 ms`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- REQ-005: ids, provenance, schema conformance ---

test('REQ-005 startTrace self-mints ids without env or when honorEnv is false', () => {
  const env = { HARNESS_TRACE_ID: 'a'.repeat(32), HARNESS_SPAN_ID: 'b'.repeat(16) };
  for (const ctx of [startTrace({ env: {} }), startTrace({ env, honorEnv: false })]) {
    assert.match(ctx.trace_id, /^[a-f0-9]{32}$/);
    assert.match(ctx.span_id, /^[a-f0-9]{16}$/);
    assert.equal(ctx.parent_span_id, null);
    assert.equal(ctx.trace_source, 'self');
    assert.notEqual(ctx.trace_id, env.HARNESS_TRACE_ID);
  }
  assert.notEqual(startTrace({ env: {} }).trace_id, startTrace({ env: {} }).trace_id);
});

test('REQ-005 startTrace honors a valid env trace and span id', () => {
  const ctx = startTrace({ env: { HARNESS_TRACE_ID: 'abcdef0123456789', HARNESS_SPAN_ID: '01234567' }, honorEnv: true });
  assert.equal(ctx.trace_id, 'abcdef0123456789');
  assert.equal(ctx.parent_span_id, '01234567');
  assert.equal(ctx.trace_source, 'env');
  assert.match(ctx.span_id, /^[a-f0-9]{16}$/);
  assert.notEqual(ctx.span_id, '01234567');
});

test('REQ-005 startTrace env rules: invalid span id → null parent; invalid trace id → self', () => {
  const noSpan = startTrace({ env: { HARNESS_TRACE_ID: 'a'.repeat(16), HARNESS_SPAN_ID: 'XYZ' }, honorEnv: true });
  assert.equal(noSpan.trace_source, 'env');
  assert.equal(noSpan.parent_span_id, null);
  for (const bad of ['ABCDEF0123456789', 'a'.repeat(15), 'a'.repeat(33), 'g'.repeat(16), '']) {
    const ctx = startTrace({ env: { HARNESS_TRACE_ID: bad, HARNESS_SPAN_ID: '01234567' }, honorEnv: true });
    assert.equal(ctx.trace_source, 'self', bad);
    assert.equal(ctx.parent_span_id, null, bad);
    assert.notEqual(ctx.trace_id, bad);
  }
});

test('REQ-005 childOf keeps trace_id and trace_source, sets parent to the root span', () => {
  for (const root of [startTrace({ env: {} }), startTrace({ env: { HARNESS_TRACE_ID: 'c'.repeat(32) } })]) {
    const child = childOf(root);
    assert.equal(child.trace_id, root.trace_id);
    assert.equal(child.trace_source, root.trace_source);
    assert.equal(child.parent_span_id, root.span_id);
    assert.match(child.span_id, /^[a-f0-9]{16}$/);
    assert.notEqual(child.span_id, root.span_id);
  }
});

test('REQ-005 buildSpan fills schema_version, ISO times, duration, trace_source, writer', () => {
  const ctx = startTrace({ env: {} });
  const span = buildSpan(ctx, {
    kind: 'hook',
    process_name: 'verify-on-stop',
    status: 'OK',
    runtime: 'claude',
    start: Date.parse('2026-11-16T10:00:00.000Z'),
    end: new Date('2026-11-16T10:00:01.250Z'),
  });
  assert.equal(span.schema_version, '1.0');
  assert.equal(span.trace_id, ctx.trace_id);
  assert.equal(span.span_id, ctx.span_id);
  assert.equal(span.parent_span_id, null);
  assert.equal(span.start_time_iso, '2026-11-16T10:00:00.000Z');
  assert.equal(span.end_time_iso, '2026-11-16T10:00:01.250Z');
  assert.equal(span.duration_ms, 1250);
  assert.equal(span.attributes.trace_source, 'self');
  assert.equal(span.writer, 'verify-on-stop');
  assert.equal(buildSpan(ctx, { kind: 'tool', process_name: 'asdd-observe', writer: 'runtime-hook' }).writer, 'runtime-hook');
  const backwards = buildSpan(ctx, { kind: 'sync', process_name: 'x', start: 2000, end: 1000 });
  assert.equal(backwards.duration_ms, 0);
  const now = buildSpan(ctx, { kind: 'sync', process_name: 'x' });
  assert.ok(now.duration_ms >= 0);
  assert.ok(!Number.isNaN(Date.parse(now.start_time_iso)));
  assert.equal(now.status, 'OK');
});

test('REQ-005 buildSpan omits undefined and null attributes', () => {
  const span = buildSpan(startTrace({ env: {} }), {
    kind: 'command',
    process_name: 'command-gate',
    attributes: { verdict: 'allow', command_label: undefined, exit_code: null, zero: 0, empty: '' },
  });
  assert.deepEqual(span.attributes, { trace_source: 'self', verdict: 'allow', zero: 0, empty: '' });
  assert.equal(Object.hasOwn(span.attributes, 'command_label'), false);
  assert.equal(Object.hasOwn(span.attributes, 'exit_code'), false);
});

test('REQ-005 every built span (root and child, each producer kind) passes validateSpan against the schema file', () => {
  const root = startTrace({ env: {} });
  const env = startTrace({ env: { HARNESS_TRACE_ID: 'd'.repeat(24), HARNESS_SPAN_ID: 'e'.repeat(12) } });
  const spans = [];
  for (const ctx of [root, childOf(root), env, childOf(env)]) {
    for (const kind of ['command', 'sensor', 'hook', 'sync', 'tool']) {
      spans.push(buildSpan(ctx, { kind, process_name: `p-${kind}`, status: 'OK' }));
    }
    spans.push(
      buildSpan(ctx, {
        kind: 'hook',
        process_name: 'verify-on-stop',
        status: 'ERROR',
        runtime: 'cli',
        slice_id: 'telemetry-emitters',
        phase: 'implementation',
        attributes: { outcome: 'could-not-run', exit_code: 2, violations_count: 3, missing: undefined },
      }),
      buildSpan(ctx, { kind: 'sync', process_name: 'sync-state', slice_id: null, phase: null, runtime: null }),
    );
  }
  for (const span of spans) assert.deepEqual(validateSpan(span, SCHEMA), [], JSON.stringify(span));
});

test('REQ-005 validateSpan rejects schema violations', () => {
  const ok = sampleSpan();
  assert.deepEqual(validateSpan(ok, SCHEMA), []);
  const cases = [
    { ...ok, extra: 1 },
    { ...ok, schema_version: '2.0' },
    { ...ok, trace_id: 'XYZ' },
    { ...ok, kind: 'nope' },
    { ...ok, duration_ms: -1 },
    { ...ok, process_name: '' },
    { ...ok, start_time_iso: 'yesterday' },
    { ...ok, parent_span_id: 'zz' },
    { ...ok, phase: 'coding' },
    { ...ok, attributes: { ...ok.attributes, passed_count: 1.5 } },
    { ...ok, attributes: { ...ok.attributes, trace_source: 'guess' } },
    { ...ok, events: [{ name: 'x' }] },
    { ...ok, events: 'x' },
    (() => {
      const { status, ...rest } = ok;
      return rest;
    })(),
  ];
  for (const bad of cases) assert.ok(validateSpan(bad, SCHEMA).length > 0, JSON.stringify(bad));
  assert.ok(validateSpan(null, SCHEMA).length > 0);
  assert.ok(validateSpan([], SCHEMA).length > 0);
  assert.deepEqual(validateSpan({ ...ok, events: [{ time_iso: ok.start_time_iso, name: 'steering_load', attributes: {} }] }, SCHEMA), []);
});

test('REQ-005 schema file sha256 equals the plan-level constant', () => {
  assert.equal(sha(readFileSync(SCHEMA_PATH)), SCHEMA_SHA256);
});

// --- REQ-004: no network ---

test('REQ-004 library imports only node:fs, node:path, node:crypto and has no network API', () => {
  const src = readFileSync(LIB_PATH, 'utf8');
  for (const needle of ['node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls', 'fetch(']) {
    assert.equal(src.includes(needle), false, needle);
  }
  const specifiers = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2]);
  assert.ok(specifiers.length > 0);
  for (const s of specifiers) assert.ok(['node:fs', 'node:path', 'node:crypto'].includes(s), s);
});

test('REQ-004 a throwing globalThis.fetch changes nothing', () => {
  const root = tempRoot();
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('network forbidden');
  };
  try {
    assert.equal(silent(() => emit(sampleSpan(), { root })), true);
    assert.equal(readFileSync(streamPath(root), 'utf8').split('\n').length, 2);
    assert.equal(readTail(root).lines.length, 1);
  } finally {
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  }
});

// --- REQ-006: state isolation ---

function hashTree(dir) {
  const out = {};
  const walk = (p, rel) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) walk(join(p, name), `${rel}/${name}`);
    } else {
      out[rel] = sha(readFileSync(p));
    }
  };
  walk(dir, '');
  return out;
}

test('REQ-006 emit leaves slices, registry, features and learning unchanged and writes only spans.jsonl', () => {
  const root = tempRoot();
  try {
    mkdirSync(join(root, '.harness/state/slices/s1/sessions'), { recursive: true });
    mkdirSync(join(root, '.harness/features'), { recursive: true });
    mkdirSync(join(root, '.harness/state/learning'), { recursive: true });
    writeFileSync(join(root, '.harness/state/slices/s1/manifest.json'), '{"phase":"implementation"}\n');
    writeFileSync(join(root, '.harness/state/slices/s1/sessions/001.json'), '{}\n');
    writeFileSync(join(root, '.harness/state/registry.json'), '{"slices":[]}\n');
    writeFileSync(join(root, '.harness/state/manifest.json'), '{}\n');
    writeFileSync(join(root, '.harness/features/s1.features.json'), '{"features":[]}\n');
    writeFileSync(join(root, '.harness/state/learning/patterns.json'), '{}\n');
    const before = hashTree(join(root, '.harness'));
    for (let i = 0; i < 10; i += 1) assert.equal(emit(sampleSpan(), { root }), true);
    emit(null, { root });
    emit(sampleSpan({ kind: 'turn' }), { root });
    const after = hashTree(join(root, '.harness'));
    const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
    assert.deepEqual(changed, [`/state/telemetry/${STREAM_FILE}`]);
    assert.deepEqual(Object.keys(before).filter((k) => !(k in after)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- REQ-022: bounded tail reader ---

test('REQ-022 readTail of a missing stream returns no lines', () => {
  const root = tempRoot();
  try {
    assert.deepEqual(readTail(root), { lines: [], fromStart: true, total: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-022 readTail of a small stream returns every line numbered from 1, fromStart', () => {
  const root = tempRoot();
  try {
    writeFileSync(streamPath(root), 'a\nb\nc\n');
    assert.deepEqual(readTail(root), {
      lines: [
        { n: 1, text: 'a' },
        { n: 2, text: 'b' },
        { n: 3, text: 'c' },
      ],
      fromStart: true,
      total: 3,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-022 readTail keeps only the last 500 lines', () => {
  const root = tempRoot();
  try {
    const lines = Array.from({ length: 700 }, (_, i) => `line-${i}`);
    writeFileSync(streamPath(root), `${lines.join('\n')}\n`);
    const tail = readTail(root);
    assert.equal(tail.lines.length, TAIL_MAX_LINES);
    assert.equal(tail.lines[0].text, 'line-200');
    assert.equal(tail.lines[0].n, 1);
    assert.equal(tail.lines.at(-1).text, 'line-699');
    assert.equal(tail.fromStart, false);
    assert.equal(tail.total, 700);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-022 readTail on a 10 MB stream does one readSync of <= 262,144 bytes and drops the cut first line', () => {
  const root = tempRoot();
  const read = mock.method(fs, 'readSync');
  try {
    const span = JSON.stringify(sampleSpan({ attributes: { pad: 'z'.repeat(150) } }));
    const count = Math.ceil((10 * 1024 * 1024) / (span.length + 1));
    const body = Buffer.from(`${span}\n`.repeat(count) + `${JSON.stringify({ last: true })}\n`);
    writeFileSync(streamPath(root), body);
    assert.ok(body.length >= 10 * 1024 * 1024);
    // Precondition: the window cuts a line (the byte before the read content is not LF).
    assert.notEqual(body[body.length - TAIL_MAX_BYTES], 0x0a);
    read.mock.resetCalls();
    const tail = readTail(root);
    assert.equal(read.mock.callCount(), 1);
    const bytes = read.mock.calls.reduce((sum, c) => sum + c.result, 0);
    assert.ok(bytes <= TAIL_MAX_BYTES, `read ${bytes} bytes`);
    assert.equal(tail.fromStart, false);
    assert.equal(tail.lines.length, TAIL_MAX_LINES);
    for (const { text } of tail.lines) JSON.parse(text);
    assert.equal(tail.lines.at(-1).text, '{"last":true}');
  } finally {
    read.mock.restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-022 readTail keeps the first line when the byte before the window is LF, drops it otherwise', () => {
  const root = tempRoot();
  try {
    // Window content = the last TAIL_MAX_BYTES - 1 bytes; the byte before it decides the first line.
    const tailLines = [...Array(2621).fill(`${'t'.repeat(99)}\n`), `${'u'.repeat(42)}\n`];
    const tailText = tailLines.join('');
    assert.equal(Buffer.byteLength(tailText), TAIL_MAX_BYTES - 1);
    writeFileSync(streamPath(root), `${'h'.repeat(50)}\n${'h'.repeat(50)}\n${tailText}`);
    assert.equal(readTail(root).total, 2622);
    writeFileSync(streamPath(root), `${'h'.repeat(50)}\n${'h'.repeat(50)}${tailText}`);
    const cut = readTail(root);
    assert.equal(cut.total, 2621);
    assert.equal(cut.fromStart, false);
    assert.equal(cut.lines.at(-1).text, 'u'.repeat(42));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- TASK-004 / REQ-017: attribution only when unambiguous ---

const PHASES = SCHEMA.properties.phase.enum.filter((p) => typeof p === 'string');

/** Temp repo with a registry and one manifest per slice. slices: { id: { status, phase } | { manifest: rawText } } */
function attributionRoot(slices = {}, { registry } = {}) {
  const root = tempRoot(false);
  mkdirSync(join(root, '.harness/state/slices'), { recursive: true });
  const rows = [];
  for (const [id, spec] of Object.entries(slices)) {
    const dir = join(root, '.harness/state/slices', id);
    mkdirSync(dir, { recursive: true });
    const text = spec.manifest ?? `${JSON.stringify({ slice_id: id, phase: spec.phase, status: spec.status })}\n`;
    if (text !== null) writeFileSync(join(dir, 'manifest.json'), text);
    rows.push({ slice_id: id, phase: spec.registryPhase ?? spec.phase, status: spec.status });
  }
  writeFileSync(
    join(root, '.harness/state/registry.json'),
    registry ?? `${JSON.stringify({ schema_version: '1.0', slices: rows })}\n`,
  );
  return root;
}

function withRoot(root, fn) {
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const NONE = { slice_id: null, phase: null };

test('REQ-017 env names an existing slice -> that slice and its manifest phase', () => {
  withRoot(
    attributionRoot({
      alpha: { status: 'in_progress', phase: 'design' },
      beta: { status: 'in_progress', phase: 'qa' },
    }),
    (root) => {
      assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'beta' }), { slice_id: 'beta', phase: 'qa' });
      assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'alpha' }), { slice_id: 'alpha', phase: 'design' });
    },
  );
});

test('REQ-017 env naming a DONE slice still attributes it (env names an existing slice)', () => {
  withRoot(attributionRoot({ old: { status: 'DONE', phase: 'knowledge' } }), (root) => {
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'old' }), { slice_id: 'old', phase: 'knowledge' });
  });
});

test('REQ-017 env names an unknown slice -> null, no fall-through to the single in_progress slice', () => {
  withRoot(attributionRoot({ only: { status: 'in_progress', phase: 'implementation' } }), (root) => {
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'missing' }), NONE);
  });
});

test('REQ-017 env with invalid characters -> null, never resolves a path outside slices/', () => {
  withRoot(attributionRoot({ only: { status: 'in_progress', phase: 'implementation' } }), (root) => {
    // A manifest reachable by traversal must not be used.
    writeFileSync(join(root, '.harness/state/manifest.json'), '{"phase":"design"}\n');
    for (const bad of ['../', '..', 'Only', 'a/b', 'a b', 'only\n', 'x:y', '', '.']) {
      assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: bad }), NONE, JSON.stringify(bad));
    }
  });
});

test('REQ-017 env unset: exactly one in_progress slice -> that slice and its manifest phase', () => {
  withRoot(
    attributionRoot({
      done: { status: 'DONE', phase: 'knowledge' },
      live: { status: 'in_progress', phase: 'implementation' },
      blocked: { status: 'blocked', phase: 'spec' },
    }),
    (root) => {
      assert.deepEqual(attribute(root, {}), { slice_id: 'live', phase: 'implementation' });
    },
  );
});

test('REQ-017 env unset: zero in_progress slices -> null', () => {
  withRoot(attributionRoot({ done: { status: 'DONE', phase: 'knowledge' } }), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
  });
});

test('REQ-017 env unset: two in_progress slices -> null', () => {
  withRoot(
    attributionRoot({
      a: { status: 'in_progress', phase: 'design' },
      b: { status: 'in_progress', phase: 'design' },
    }),
    (root) => {
      assert.deepEqual(attribute(root, {}), NONE);
    },
  );
});

test('REQ-017 unreadable or unparsable manifest -> null (env rule and registry rule)', () => {
  withRoot(attributionRoot({ live: { status: 'in_progress', manifest: '{not json' } }), (root) => {
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'live' }), NONE);
    assert.deepEqual(attribute(root, {}), NONE);
  });
  withRoot(attributionRoot({ live: { status: 'in_progress', manifest: null } }), (root) => {
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'live' }), NONE);
    assert.deepEqual(attribute(root, {}), NONE);
  });
});

test('REQ-017 unreadable registry or missing .harness -> null', () => {
  withRoot(attributionRoot({ live: { status: 'in_progress', phase: 'qa' } }, { registry: '{oops' }), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
  });
  withRoot(attributionRoot({ live: { status: 'in_progress', phase: 'qa' } }, { registry: '{"slices":{}}' }), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
  });
  withRoot(tempRoot(false), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'x' }), NONE);
  });
});

test('REQ-017 phase outside the schema enum -> both null', () => {
  withRoot(attributionRoot({ live: { status: 'in_progress', phase: 'shipping' } }), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
    assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'live' }), NONE);
  });
  withRoot(attributionRoot({ live: { status: 'in_progress', phase: 7 } }), (root) => {
    assert.deepEqual(attribute(root, {}), NONE);
  });
});

test('REQ-017 phase follows the manifest at call time, not the registry or the env', () => {
  withRoot(
    attributionRoot({ live: { status: 'in_progress', phase: 'implementation', registryPhase: 'design' } }),
    (root) => {
      assert.deepEqual(attribute(root, {}), { slice_id: 'live', phase: 'implementation' });
      const mp = join(root, '.harness/state/slices/live/manifest.json');
      writeFileSync(mp, `${JSON.stringify({ slice_id: 'live', phase: 'qa', status: 'in_progress' })}\n`);
      assert.deepEqual(attribute(root, { HARNESS_SLICE_ID: 'live' }), { slice_id: 'live', phase: 'qa' });
      assert.deepEqual(attribute(root, {}), { slice_id: 'live', phase: 'qa' });
    },
  );
});

test('REQ-017 every schema phase is accepted and the result validates as span fields', () => {
  for (const phase of PHASES) {
    withRoot(attributionRoot({ live: { status: 'in_progress', phase } }), (root) => {
      const got = attribute(root, {});
      assert.deepEqual(got, { slice_id: 'live', phase });
      const span = buildSpan(startTrace({ env: {} }), { kind: 'command', process_name: 'command-gate', ...got });
      assert.deepEqual(validateSpan(span, SCHEMA), []);
    });
  }
});

test('REQ-017 HARNESS_TRACE_ID / HARNESS_SPAN_ID do not change the result (never read)', () => {
  const trace = { HARNESS_TRACE_ID: 'a'.repeat(32), HARNESS_SPAN_ID: 'b'.repeat(16) };
  withRoot(
    attributionRoot({
      a: { status: 'in_progress', phase: 'design' },
      b: { status: 'in_progress', phase: 'qa' },
    }),
    (root) => {
      assert.deepEqual(attribute(root, trace), attribute(root, {}));
      assert.deepEqual(attribute(root, { ...trace, HARNESS_SLICE_ID: 'b' }), attribute(root, { HARNESS_SLICE_ID: 'b' }));
      // A slice named like the trace id is still not chosen from it.
      assert.deepEqual(attribute(root, { HARNESS_TRACE_ID: 'a' }), NONE);
    },
  );
  const src = readFileSync(LIB_PATH, 'utf8');
  const body = src.slice(src.indexOf('export function attribute'));
  const fnText = body.slice(0, body.indexOf('\n}\n') + 2);
  for (const needle of ['HARNESS_TRACE_ID', 'HARNESS_SPAN_ID', 'trace_id', 'parent_span_id']) {
    assert.equal(fnText.includes(needle), false, needle);
  }
});

test('REQ-017 attribute defaults env to process.env', () => {
  withRoot(attributionRoot({ live: { status: 'in_progress', phase: 'qa' } }), (root) => {
    const saved = process.env.HARNESS_SLICE_ID;
    try {
      delete process.env.HARNESS_SLICE_ID;
      assert.deepEqual(attribute(root), { slice_id: 'live', phase: 'qa' });
      process.env.HARNESS_SLICE_ID = 'nope';
      assert.deepEqual(attribute(root), NONE);
    } finally {
      if (saved === undefined) delete process.env.HARNESS_SLICE_ID;
      else process.env.HARNESS_SLICE_ID = saved;
    }
  });
});

// --- TASK-004 / REQ-015: guidance targets, string operations only ---

const GROOT = join(tmpdir(), 'asdd-guidance-root');

test('REQ-015 guidanceTarget table', () => {
  const cases = [
    // steering, relative and absolute
    ['.harness/steering/controls.md', '.harness/steering/controls.md'],
    ['.harness/steering/skills.md', '.harness/steering/skills.md'],
    ['.harness/steering/bindings/nested/deep.md', '.harness/steering/bindings/nested/deep.md'],
    [join(GROOT, '.harness/steering/skills.md'), '.harness/steering/skills.md'],
    ['./.harness/steering/tech.md', '.harness/steering/tech.md'],
    // canonical skills
    ['.agents/skills/codegraph/SKILL.md', '.agents/skills/codegraph/SKILL.md'],
    ['.agents/skills/codegraph/references/cli.md', '.agents/skills/codegraph/references/cli.md'],
    ['.agents/skills/codegraph/references/a/b.md', '.agents/skills/codegraph/references/a/b.md'],
    [join(GROOT, '.agents/skills/x/SKILL.md'), '.agents/skills/x/SKILL.md'],
    // runtime aliases rewritten
    ['.claude/skills/asdd-status/SKILL.md', '.agents/skills/asdd-status/SKILL.md'],
    [join(GROOT, '.claude/skills/asdd-status/SKILL.md'), '.agents/skills/asdd-status/SKILL.md'],
    ['.cursor/skills/foo/references/r.md', '.agents/skills/foo/references/r.md'],
    ['.devin/skills/foo/SKILL.md', '.agents/skills/foo/SKILL.md'],
    // non-guidance
    ['package.json', null],
    [join(GROOT, 'package.json'), null],
    ['.harness/steering', null],
    ['.harness/steering/', null],
    ['.harness/state/registry.json', null],
    ['.harness/specs/x/requirements.md', null],
    ['.agents/skills/codegraph/other.md', null],
    ['.agents/skills/codegraph/scripts/run.sh', null],
    ['.agents/skills/codegraph/references', null],
    ['.agents/skills/codegraph', null],
    ['.agents/skills/SKILL.md', null],
    ['.agents/agents/asdd-implementation-agent.md', null],
    ['.opencode/skills/foo/SKILL.md', null],
    ['.kiro/skills/foo/SKILL.md', null],
    ['.claude/agents/x.md', null],
    ['CLAUDE.md', null],
    ['docs/.harness/steering/x.md', null],
    // outside the root
    [join(tmpdir(), 'elsewhere/.harness/steering/x.md'), null],
    [`${GROOT}-evil/.harness/steering/x.md`, null],
    ['/.harness/steering/x.md', null],
    // traversal, NUL, colon
    ['../.harness/steering/x.md', null],
    ['.harness/steering/../../etc/passwd', null],
    ['.harness/steering/../steering/x.md', null],
    ['.agents/skills/../skills/x/SKILL.md', null],
    ['.harness/steering/x\0.md', null],
    ['.harness/steering/c:x.md', null],
    ['C:/repo/.harness/steering/x.md', null],
    ['.agents/skills/plugin:name/SKILL.md', null],
    // non-strings and empty
    ['', null],
    [null, null],
    [undefined, null],
    [42, null],
    [{}, null],
  ];
  for (const [raw, want] of cases) assert.equal(guidanceTarget(raw, GROOT), want, JSON.stringify(raw));
});

test('REQ-015 guidanceTarget uses no stat/realpath/exists (string operations only)', () => {
  const spies = ['statSync', 'lstatSync', 'realpathSync', 'existsSync', 'accessSync', 'readFileSync', 'openSync'].map((m) =>
    mock.method(fs, m),
  );
  try {
    assert.equal(guidanceTarget(join(GROOT, '.claude/skills/a/SKILL.md'), GROOT), '.agents/skills/a/SKILL.md');
    assert.equal(guidanceTarget('package.json', GROOT), null);
    for (const s of spies) assert.equal(s.mock.callCount(), 0);
  } finally {
    for (const s of spies) s.mock.restore();
  }
});

test('REQ-015 guidanceTarget never throws on a bad root (absolute needs a root; relative is used as is, §12.4)', () => {
  assert.equal(guidanceTarget(join(GROOT, '.harness/steering/x.md'), null), null);
  assert.equal(guidanceTarget(join(GROOT, '.harness/steering/x.md'), undefined), null);
  assert.equal(guidanceTarget(join(GROOT, '.harness/steering/x.md'), 42), null);
  assert.equal(guidanceTarget('.harness/steering/x.md', undefined), '.harness/steering/x.md');
});

// --- TASK-004: skillTarget ---

function skillsRoot(names) {
  const root = tempRoot(false);
  for (const n of names) {
    mkdirSync(join(root, '.agents/skills', n), { recursive: true });
    writeFileSync(join(root, '.agents/skills', n, 'SKILL.md'), `# ${n}\n`);
  }
  return root;
}

test('REQ-015 skillTarget returns the canonical SKILL.md only for an installed, safe name', () => {
  withRoot(skillsRoot(['codegraph', 'asdd-status', 'a.b_c-1']), (root) => {
    mkdirSync(join(root, '.agents/skills/no-skill-md'), { recursive: true });
    assert.equal(skillTarget('codegraph', root), '.agents/skills/codegraph/SKILL.md');
    assert.equal(skillTarget('asdd-status', root), '.agents/skills/asdd-status/SKILL.md');
    assert.equal(skillTarget('a.b_c-1', root), '.agents/skills/a.b_c-1/SKILL.md');
    for (const bad of [
      'humanizer:humanizer',
      'plugin:codegraph',
      'codegraph/references',
      '../codegraph',
      '..',
      '.',
      'a..b',
      'not-installed',
      'no-skill-md',
      'code graph',
      'codegraph\0',
      '',
      null,
      undefined,
      7,
    ]) {
      assert.equal(skillTarget(bad, root), null, JSON.stringify(bad));
    }
  });
});

// --- TASK-004: committed Claude fixtures (${REPO} -> temp root) ---

const FIXTURE_DIR = join(HERE, '../../test/fixtures/telemetry/claude');

function loadFixture(name, root) {
  const text = readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8').replaceAll('${REPO}', root);
  return JSON.parse(text).payload;
}

test('REQ-015 Claude fixtures: Read paths and Skill names map to the canonical targets', () => {
  withRoot(skillsRoot(['codegraph', 'asdd-status']), (root) => {
    const read = (n) => guidanceTarget(loadFixture(n, root).tool_input.file_path, root);
    const skill = (n) => skillTarget(loadFixture(n, root).tool_input.skill, root);
    assert.equal(read('posttooluse-read-steering'), '.harness/steering/controls.md');
    assert.equal(read('posttooluse-read-offset-limit'), '.harness/steering/skills.md');
    assert.equal(read('posttooluse-read-subagent'), '.harness/steering/manifest.md');
    assert.equal(read('posttooluse-read-claude-skills'), '.agents/skills/asdd-status/SKILL.md');
    assert.equal(read('posttooluse-read-nonguidance'), null);
    assert.equal(skill('posttooluse-skill-installed'), '.agents/skills/codegraph/SKILL.md');
    assert.equal(skill('posttooluse-skill-namespaced'), null);
  });
});

// --- TASK-004 / REQ-006: policy reads change no state ---

test('REQ-006 attribute, guidanceTarget and skillTarget change no state (hash check)', () => {
  const root = attributionRoot({
    live: { status: 'in_progress', phase: 'implementation' },
    other: { status: 'DONE', phase: 'knowledge' },
  });
  try {
    mkdirSync(join(root, '.agents/skills/codegraph'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/codegraph/SKILL.md'), '# codegraph\n');
    mkdirSync(join(root, TELEMETRY_DIR), { recursive: true });
    const before = { harness: hashTree(join(root, '.harness')), agents: hashTree(join(root, '.agents')) };
    const top = readdirSync(root).sort();
    for (let i = 0; i < 5; i += 1) {
      attribute(root, {});
      attribute(root, { HARNESS_SLICE_ID: 'other' });
      attribute(root, { HARNESS_SLICE_ID: 'ghost' });
      guidanceTarget(join(root, '.claude/skills/codegraph/SKILL.md'), root);
      skillTarget('codegraph', root);
      skillTarget('ghost', root);
    }
    assert.deepEqual({ harness: hashTree(join(root, '.harness')), agents: hashTree(join(root, '.agents')) }, before);
    assert.deepEqual(readdirSync(root).sort(), top);
    assert.equal(existsSync(streamPath(root)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── TASK-009 (REQ-011): runtime template ────────────────────────────────────────────────────────────────────────

test('REQ-011 runtime template: guidance loads with the read or skill tool; no span instruction', () => {
  const template = readFileSync(join(HERE, '../../agents/_runtime-template.md'), 'utf8');
  const flat = template.replace(/\s+/g, ' ');
  assert.match(
    flat,
    /Load steering files and skill bodies with the runtime's file-read or skill tool, never with a shell command \(`cat`, `sed`, `head`\)\./,
  );
  // No span write path of any kind: no span, turn span, or subagent span instruction, no derivation from sessions.
  assert.doesNotMatch(flat, /\bspans?\b/i);
  assert.doesNotMatch(flat, /spans\.jsonl|telemetry\//i);
  assert.doesNotMatch(flat, /\bturn[- ]span|\bsubagent[- ]span/i);
});

// ── TASK-011 (REQ-020, REQ-021): profile model, pure functions over arrays ──────────────────────────────────────

const H = 3_600_000;
const T0 = Date.parse('2026-11-01T00:00:00.000Z');
const at = (hours) => new Date(T0 + hours * H).toISOString();
const ev = (event_type, phase, hours) => ({ event_type, phase, timestamp: at(hours), slice_id: 'demo' });

// Amended slice: spec and validation are re-run after a mid-slice phase_started (ADR-005), domain is open.
// Listed out of order on purpose (unsorted input).
const AMENDED_SESSIONS = [
  ev('phase_completed', 'spec', 11),
  ev('phase_started', 'discovery', 0),
  ev('phase_completed', 'validation', 4),
  ev('phase_blocked', 'validation', 3.5),
  { event_type: 'feature_completed', feature_id: 'TASK-001', timestamp: at(3.75) },
  ev('phase_completed', 'discovery', 1),
  ev('phase_started', 'domain', 12),
  ev('phase_completed', 'spec', 3),
  ev('phase_started', 'spec', 10),
  ev('phase_completed', 'validation', 11.5),
];
// Completed segments: discovery 1h, spec 2h + 1h, validation 1h + 0.5h; domain open. Idle 04:00→10:00 never counted.
const AMENDED_DENOMINATOR_MS = 5.5 * H;

function span(kind, duration_ms, extra = {}) {
  return {
    schema_version: '1.0',
    trace_id: 'a'.repeat(32),
    span_id: 'b'.repeat(16),
    parent_span_id: null,
    kind,
    slice_id: 'demo',
    phase: 'implementation',
    process_name: kind === 'tool' ? 'asdd-observe' : `${kind}-producer`,
    start_time_iso: at(20),
    end_time_iso: at(20),
    duration_ms,
    status: 'OK',
    attributes: { trace_source: 'self' },
    writer: kind === 'tool' ? 'runtime-hook' : `${kind}-producer`,
    ...extra,
  };
}

function record(target_path, runtime, phase, attrs = {}, slice_id = 'demo') {
  return span('tool', 1, {
    runtime,
    phase,
    slice_id,
    attributes: { trace_source: 'self', target_path, ...(runtime === 'claude' ? { tool_name: 'Read' } : {}), ...attrs },
  });
}

test('REQ-020 phaseMarkers: disjoint segments over an amended slice, unsorted input, open phase', () => {
  const markers = telemetryLib.phaseMarkers(AMENDED_SESSIONS);
  assert.deepEqual(markers, [
    {
      phase: 'discovery',
      status: 'completed',
      start_iso: at(0),
      end_iso: at(1),
      duration_ms: 1 * H,
      start_source: 'phase_started',
      segments: 1,
    },
    {
      phase: 'spec',
      status: 'completed',
      start_iso: at(1),
      end_iso: at(11),
      duration_ms: 3 * H,
      start_source: 'previous_phase_completed',
      segments: 2,
    },
    {
      phase: 'validation',
      status: 'completed',
      start_iso: at(3),
      end_iso: at(11.5),
      duration_ms: 1.5 * H,
      start_source: 'previous_phase_completed',
      segments: 2,
    },
    // Open phase: no end, no duration (no "now"), excluded from the denominator.
    { phase: 'domain', status: 'open', start_iso: at(12), start_source: 'phase_started' },
  ]);
  const completed = markers.filter((m) => m.status === 'completed').reduce((sum, m) => sum + m.duration_ms, 0);
  assert.equal(completed, AMENDED_DENOMINATOR_MS);
});

test('REQ-020 phaseMarkers: order-independent, ignores phase_blocked and non-phase events, no clock', () => {
  const nowSpy = mock.method(Date, 'now', () => {
    throw new Error('the profile model never reads the clock');
  });
  try {
    const sorted = telemetryLib.phaseMarkers(AMENDED_SESSIONS);
    const reversed = telemetryLib.phaseMarkers([...AMENDED_SESSIONS].reverse());
    const withoutNoise = telemetryLib.phaseMarkers(
      AMENDED_SESSIONS.filter((s) => s.event_type === 'phase_started' || s.event_type === 'phase_completed'),
    );
    assert.deepEqual(reversed, sorted);
    assert.deepEqual(withoutNoise, sorted);
    assert.equal(nowSpy.mock.callCount(), 0);
  } finally {
    nowSpy.mock.restore();
  }
});

test('REQ-020 phaseMarkers: a phase re-opened by a trailing phase_started keeps its completed time and is marked open', () => {
  const markers = telemetryLib.phaseMarkers([
    ev('phase_started', 'spec', 0),
    ev('phase_completed', 'spec', 2),
    ev('phase_started', 'spec', 5),
  ]);
  assert.deepEqual(markers, [
    {
      phase: 'spec',
      status: 'completed',
      start_iso: at(0),
      end_iso: at(2),
      duration_ms: 2 * H,
      start_source: 'phase_started',
      segments: 1,
      open_since_iso: at(5),
    },
  ]);
});

test('REQ-020 phaseMarkers: empty, malformed, and anchorless input never throws', () => {
  assert.deepEqual(telemetryLib.phaseMarkers([]), []);
  assert.deepEqual(telemetryLib.phaseMarkers(undefined), []);
  assert.deepEqual(
    telemetryLib.phaseMarkers([null, 7, { event_type: 'phase_started' }, { event_type: 'phase_started', phase: 'spec', timestamp: 'nope' }]),
    [],
  );
  // A completion with no preceding phase event has no segment start: listed with its end, no duration.
  assert.deepEqual(telemetryLib.phaseMarkers([ev('phase_completed', 'spec', 2)]), [
    { phase: 'spec', status: 'completed', end_iso: at(2), segments: 0 },
  ]);
});

test('REQ-020 percentile: nearest rank against precomputed values', () => {
  const { percentile } = telemetryLib;
  assert.equal(percentile([15, 20, 35, 40, 50], 50), 35);
  assert.equal(percentile([50, 40, 35, 20, 15], 95), 50);
  const twenty = [7, 3, 19, 1, 12, 20, 5, 14, 9, 16, 2, 18, 11, 6, 13, 4, 17, 8, 15, 10];
  assert.equal(percentile(twenty, 50), 10);
  assert.equal(percentile(twenty, 95), 19);
  assert.equal(percentile(twenty, 100), 20);
  assert.equal(percentile([42], 50), 42);
  // Unmeasured -> absent (OI-3): no 0 and no null stand-in.
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile(['x', NaN, null], 95), undefined);
  assert.deepEqual(twenty.length, 20); // input is not mutated by the sort
  assert.equal(twenty[0], 7);
});

test('REQ-020 surfaceScores: 0 hits + floor(share / 10%), ordered by score desc then name asc', () => {
  const { surfaceScores } = telemetryLib;
  const spans = [
    span('command', 4_000_000),
    span('command', 2_000_000), // command 6,000,000 / 19,800,000 = 30.3% -> 3
    span('hook', 1_980_000), // exactly 10% -> 1
    span('tool', 9_000_000), // not a surface
  ];
  assert.deepEqual(surfaceScores(spans, AMENDED_DENOMINATOR_MS), [
    { surface: 'command', hits: 0, total_ms: 6_000_000, share: 6_000_000 / AMENDED_DENOMINATOR_MS, score: 3 },
    { surface: 'hook', hits: 0, total_ms: 1_980_000, share: 0.1, score: 1 },
    { surface: 'sync', hits: 0, total_ms: 0, share: 0, score: 0 },
  ]);
  // Float trap: 0.3 / 0.1 = 2.999… must still score 3.
  assert.equal(surfaceScores([span('sync', 3)], 10).find((s) => s.surface === 'sync').score, 3);
  // Tie on score -> name ascending.
  assert.deepEqual(
    surfaceScores([span('sync', 1), span('hook', 1), span('command', 1)], 1000).map((s) => s.surface),
    ['command', 'hook', 'sync'],
  );
});

test('REQ-020 surfaceScores: denominator 0 -> share term 0 and share unknown (no share key)', () => {
  const scores = telemetryLib.surfaceScores([span('command', 500)], 0);
  assert.deepEqual(scores, [
    { surface: 'command', hits: 0, total_ms: 500, share_unknown: true, score: 0 },
    { surface: 'hook', hits: 0, total_ms: 0, share_unknown: true, score: 0 },
    { surface: 'sync', hits: 0, total_ms: 0, share_unknown: true, score: 0 },
  ]);
});

const STEERING = [
  { path: '.harness/steering/always.md', inclusion: 'always', tags: [] },
  { path: '.harness/steering/impl.md', inclusion: 'auto', tags: ['implementation', 'qa'] },
  { path: '.harness/steering/spec-only.md', inclusion: 'auto', tags: ['spec'] },
];
const SKILLS = ['.agents/skills/tdd/SKILL.md'];

test('REQ-021 activationRows: three states per runtime column, hooked runtimes only, missing ids -> unknown', () => {
  const records = [
    record('.harness/steering/always.md', 'claude', 'implementation', { runtime_session_id: 's1' }),
    record('.harness/steering/always.md', 'claude', 'implementation', { agent_id: 'ag1' }),
    record('.harness/steering/always.md', 'claude', 'spec', { runtime_session_id: 's9' }), // other phase
  ];
  const table = telemetryLib.activationRows({
    phase: 'implementation',
    records,
    steering: STEERING,
    skills: SKILLS,
    runtimes: ['claude', 'cursor', 'devin'],
    observeHooks: { claude: true, cursor: false, devin: true }, // devin has no load hooks: never `not observed`
    configured: [{ path: 'CLAUDE.md', runtime: 'claude' }],
  });
  assert.equal(table.phase, 'implementation');
  assert.deepEqual(table.columns, ['claude', 'cursor', 'devin']);
  assert.equal(table.runtimes_configured, true);
  assert.deepEqual(
    table.rows.map((r) => [r.target, r.type, r.expected]),
    [
      ['.harness/steering/always.md', 'steering', true],
      ['.harness/steering/impl.md', 'steering', true],
      ['.agents/skills/tdd/SKILL.md', 'skill', true],
    ],
  );
  const [always, impl, skill] = table.rows;
  assert.deepEqual(always.cells.claude, {
    state: 'observed',
    label: 'observed (2)',
    count: 2,
    runtime_session_ids: ['s1', 'unknown'],
    agent_ids: ['ag1', 'unknown'],
  });
  assert.deepEqual(always.cells.cursor, { state: 'unknown', label: 'unknown' }); // observe entry not wired
  assert.deepEqual(always.cells.devin, { state: 'unknown', label: 'unknown' }); // hookless runtime
  assert.deepEqual(impl.cells.claude, { state: 'not observed', label: 'not observed' });
  assert.deepEqual(skill.cells.claude, { state: 'not observed', label: 'not observed' });
  assert.deepEqual(table.configured, [
    { target: 'CLAUDE.md', runtime: 'claude', state: 'configured, not observed', label: 'configured, not observed' },
  ]);

  // Cursor with its observe entry present -> `not observed`.
  const wired = telemetryLib.activationRows({
    phase: 'implementation',
    records,
    steering: STEERING,
    skills: SKILLS,
    runtimes: ['claude', 'cursor'],
    observeHooks: { claude: true, cursor: true },
    configured: [],
  });
  assert.deepEqual(wired.rows[1].cells.cursor, { state: 'not observed', label: 'not observed' });
});

test('REQ-021 activationRows: observed targets outside the expected set get their own row; runtimes not configured', () => {
  const table = telemetryLib.activationRows({
    phase: 'implementation',
    records: [
      record('.harness/steering/spec-only.md', 'cursor', 'implementation', { runtime_session_id: 'c1' }),
      record('.agents/skills/tdd/references/x.md', 'claude', 'implementation', { runtime_session_id: 's1', agent_id: 'a' }),
    ],
    steering: STEERING,
    skills: SKILLS,
    runtimes: undefined,
    observeHooks: {},
    configured: [],
  });
  assert.equal(table.runtimes_configured, false);
  assert.deepEqual(table.columns, ['claude', 'cursor']); // runtimes seen in the records, sorted
  const extra = table.rows.filter((r) => !r.expected).map((r) => r.target);
  assert.deepEqual(extra, ['.agents/skills/tdd/references/x.md', '.harness/steering/spec-only.md']);
  const specOnly = table.rows.find((r) => r.target === '.harness/steering/spec-only.md');
  assert.deepEqual(specOnly.cells.cursor.agent_ids, ['unknown']); // Cursor never carries an agent id
  assert.deepEqual(specOnly.cells.claude, { state: 'unknown', label: 'unknown' }); // claude observe entry absent
});

test('REQ-021 ACTIVATION_LEGEND states exactly the three states with the required meanings', () => {
  assert.deepEqual(telemetryLib.ACTIVATION_LEGEND, [
    { state: 'not observed', meaning: 'a runtime with load hooks reported no load' },
    {
      state: 'unknown',
      meaning:
        'the load is not visible to the kit (loads through shell commands, and every load on a runtime without load hooks)',
    },
    { state: 'configured, not observed', meaning: 'the file enters context without a tool call' },
  ]);
  assert.equal(Object.isFrozen(telemetryLib.ACTIVATION_LEGEND), true);
});

function modelInput(spans) {
  return {
    sliceId: 'demo',
    spans,
    sessions: AMENDED_SESSIONS,
    steering: STEERING,
    skills: SKILLS,
    runtimes: ['claude', 'cursor', 'devin'],
    observeHooks: { claude: true },
    configured: [{ path: 'CLAUDE.md', runtime: 'claude' }],
  };
}

function fixtureStream() {
  const command = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10].map((d) => span('command', d));
  return [
    ...command,
    span('hook', 30),
    span('hook', 10),
    span('hook', 20),
    span('sync', 100, { process_name: 'sync-state' }),
    span('sync', 40, { process_name: 'sync-state/knowledge-index', parent_span_id: 'b'.repeat(16) }),
    span('command', 999, { slice_id: 'other' }), // other slice: never counted
    span('command', 7, { slice_id: null, phase: null }), // unattributed
    record('.harness/steering/always.md', 'claude', 'implementation', { runtime_session_id: 's1' }),
    record('.harness/steering/always.md', 'claude', null, {}, null), // unattributed activation record
  ];
}

test('REQ-020 profileModel: phase durations, p50/p95 per kind, scores, unattributed count, not_measured', () => {
  const model = telemetryLib.profileModel(modelInput(fixtureStream()));
  assert.equal(model.slice_id, 'demo');
  assert.deepEqual(model.phase_durations, telemetryLib.phaseMarkers(AMENDED_SESSIONS));
  assert.deepEqual(model.latencies, {
    command: { count: 10, p50: 5, p95: 10 },
    hook: { count: 3, p50: 20, p95: 30 },
    sync: { count: 2, p50: 40, p95: 100 }, // root and child sync spans both count
  });
  assert.deepEqual(model.scores, telemetryLib.surfaceScores(fixtureStream().filter((s) => s.slice_id === 'demo'), AMENDED_DENOMINATOR_MS));
  assert.equal(model.unattributed_spans, 2);
  assert.equal(model.attributed_spans, 16);
  assert.deepEqual(model.not_measured, ['turn_latency', 'boot_tax', 'tokens', 'h_findings']);
  assert.deepEqual(model.legend, telemetryLib.ACTIVATION_LEGEND);
  // One activation table per listed phase plus any phase seen only in records.
  assert.deepEqual(
    model.activation.map((t) => t.phase),
    ['discovery', 'spec', 'validation', 'domain', 'implementation'],
  );
  const impl = model.activation.find((t) => t.phase === 'implementation');
  assert.equal(impl.rows[0].cells.claude.label, 'observed (1)');
});

test('REQ-020 profileModel: unmeasured latencies are absent, never 0 or null (OI-3)', () => {
  const model = telemetryLib.profileModel(modelInput([span('hook', 12)]));
  assert.deepEqual(Object.keys(model.latencies), ['hook']);
  assert.equal(JSON.stringify(model.latencies).includes('null'), false);
});

test('REQ-020 profileModel: deterministic across runs and input order', () => {
  const a = telemetryLib.profileModel(modelInput(fixtureStream()));
  const b = telemetryLib.profileModel(modelInput(fixtureStream().reverse()));
  const c = telemetryLib.profileModel({ ...modelInput(fixtureStream()), sessions: [...AMENDED_SESSIONS].reverse() });
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(JSON.stringify(telemetryLib.profileModel(modelInput(fixtureStream()))), JSON.stringify(a));
});

test('REQ-020 AR-10 profileModel: streams differing only in trace_id/parent_span_id give the same model', () => {
  const base = fixtureStream();
  const rewired = base.map((s, i) => ({
    ...s,
    trace_id: createHash('sha256').update(`t${i}`).digest('hex').slice(0, 32),
    parent_span_id: i % 2 ? createHash('sha256').update(`p${i}`).digest('hex').slice(0, 16) : null,
  }));
  assert.deepEqual(telemetryLib.profileModel(modelInput(rewired)), telemetryLib.profileModel(modelInput(base)));
});

test('REQ-020 AR-10 profileModel never reads trace topology (trace_id, parent_span_id, span_id)', () => {
  const touched = new Set();
  const guarded = fixtureStream().map(
    (s) =>
      new Proxy(s, {
        get(target, key, receiver) {
          if (key === 'trace_id' || key === 'parent_span_id' || key === 'span_id') touched.add(key);
          return Reflect.get(target, key, receiver);
        },
        ownKeys(target) {
          touched.add('ownKeys');
          return Reflect.ownKeys(target);
        },
      }),
  );
  telemetryLib.profileModel(modelInput(guarded));
  assert.deepEqual([...touched], []);
});

test('REQ-021 the profile model never yields the words `not loaded`', () => {
  const outputs = [
    telemetryLib.profileModel(modelInput(fixtureStream())),
    telemetryLib.profileModel({ ...modelInput([]), runtimes: undefined, observeHooks: {} }),
    telemetryLib.profileModel({ ...modelInput(fixtureStream()), runtimes: ['devin', 'opencode', 'kimi', 'junie', 'kiro'] }),
    telemetryLib.ACTIVATION_LEGEND,
  ];
  for (const out of outputs) assert.doesNotMatch(JSON.stringify(out), /not loaded/i);
  // Hookless columns: every row `unknown`, never `not observed`.
  const hookless = outputs[2].activation.flatMap((t) => t.rows.flatMap((r) => Object.values(r.cells)));
  assert.ok(hookless.length > 0);
  assert.ok(hookless.every((c) => c.state === 'unknown'));
});

test('REQ-022 TEL-9 the profile model writes nothing and reads no file, clock, or network', () => {
  const spies = ['writeFileSync', 'appendFileSync', 'openSync', 'writeSync', 'mkdirSync', 'readFileSync', 'readSync', 'statSync']
    .map((name) => mock.method(fs, name));
  const nowSpy = mock.method(Date, 'now');
  try {
    const input = modelInput(fixtureStream());
    const before = JSON.stringify(input);
    telemetryLib.profileModel(input);
    telemetryLib.phaseMarkers(AMENDED_SESSIONS);
    telemetryLib.surfaceScores(fixtureStream(), 1);
    telemetryLib.percentile([1, 2, 3], 50);
    telemetryLib.activationRows({ phase: 'spec', records: [], steering: STEERING, skills: SKILLS, runtimes: ['claude'], observeHooks: {}, configured: [] });
    for (const spy of spies) assert.equal(spy.mock.callCount(), 0, 'no fs call');
    assert.equal(nowSpy.mock.callCount(), 0, 'no clock read');
    assert.equal(JSON.stringify(input), before, 'inputs are not mutated');
  } finally {
    for (const spy of spies) spy.mock.restore();
    nowSpy.mock.restore();
  }
});

test('REQ-020 OI-2 no H-* heuristic weights or evaluation in the library', () => {
  const src = readFileSync(LIB_PATH, 'utf8');
  assert.doesNotMatch(src, /\bH-[A-Z]+\b/);
  assert.doesNotMatch(src, /severity|weight/i);
  assert.doesNotMatch(src, /pipeline-metrics|sync-state\.mjs['"]/);
});

// ---- minted-span contract (telemetry-phase2): mintSpan/emit/builtin-validate/synthesize/evaluator ----

const mkroot = () => {
  const root = mkdtempSync(join(tmpdir(), 'tel-'));
  mkdirSync(join(root, TELEMETRY_DIR), { recursive: true });
  return root;
};

const base = (extra = {}) => mintSpan({
  kind: 'command', process_name: 'test-producer', runtime: 'cli',
  start_time_iso: '2026-11-17T10:00:00.000Z', end_time_iso: '2026-11-17T10:00:01.000Z',
  duration_ms: 1000, status: 'OK', writer: 'unit-test', ...extra,
}, { env: {} });

test('emit appends one LF-terminated schema line and returns true', () => {
  const root = mkroot();
  assert.equal(emit(base(), { root }), true);
  const text = readFileSync(join(root, TELEMETRY_DIR, 'spans.jsonl'), 'utf8');
  const lines = text.trim().split('\n');
  assert.equal(lines.length, 1);
  const span = JSON.parse(lines[0]);
  assert.equal(span.kind, 'command');
  assert.equal(span.attributes.trace_source, 'self');
  assert.equal(validateSpan(span).length, 0);
  assert.ok(Buffer.byteLength(lines[0]) <= MAX_LINE_BYTES);
});

test('emit is fail-open: missing dir, malformed span, oversize span', () => {
  const noDir = mkdtempSync(join(tmpdir(), 'tel-nodir-'));
  assert.equal(emit(base(), { root: noDir }), false);
  const root = mkroot();
  assert.equal(emit({ kind: 'command' }, { root }), false); // malformed
  const big = base({ attributes: { trace_source: 'self', pad: 'x'.repeat(5000) } });
  assert.equal(emit(big, { root }), false); // oversize even after events drop
  assert.equal(existsSync(join(root, TELEMETRY_DIR, 'spans.jsonl')), false);
});

test('mintSpan inherits env trace ids; absent env self-mints a root', () => {
  const env = { HARNESS_TRACE_ID: 'a91f03c2d77e4b01', HARNESS_SPAN_ID: 'f04bd812' };
  const child = mintSpan({ kind: 'command', process_name: 'p' }, { env });
  assert.equal(child.trace_id, 'a91f03c2d77e4b01');
  assert.equal(child.parent_span_id, 'f04bd812');
  assert.equal(child.attributes.trace_source, 'env');
  const rootSpan = mintSpan({ kind: 'turn', process_name: 'p' }, { env: {} });
  assert.equal(rootSpan.parent_span_id, null);
  assert.equal(rootSpan.attributes.trace_source, 'self');
});

test('validateSpan rejects producer-set reserved attrs and bad vocab', () => {
  const reserved = base({ attributes: { trace_source: 'self', heuristic: 'H-LOOP' } });
  assert.ok(validateSpan(reserved).some((p) => p.includes('reserved')));
  const bad = base({ kind: 'nope' });
  assert.ok(validateSpan(bad).some((p) => p.includes('kind')));
  const extra = { ...base(), surprise: 1 };
  assert.ok(validateSpan(extra).some((p) => p.includes('unknown top-level')));
});

test('emit never perturbs exitCode and p99 emit latency ≤ 50 ms', () => {
  const root = mkroot();
  const times = [];
  for (let i = 0; i < 120; i += 1) {
    const t0 = performance.now();
    emit(base(), { root });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99) - 1];
  assert.ok(p99 <= 50, `p99 emit latency ${p99.toFixed(2)}ms exceeds 50ms`);
  assert.ok(!process.exitCode, 'emit must never set process.exitCode');
});

test('readTail returns the bounded tail with line records', () => {
  const root = mkroot();
  const file = join(root, TELEMETRY_DIR, 'spans.jsonl');
  for (let i = 0; i < 10; i += 1) writeFileSync(file, `${JSON.stringify(base())}\n`, { flag: 'a' });
  const tail = readTail(root, { maxLines: 5 });
  assert.equal(tail.lines.length, 5);
  assert.equal(tail.fromStart, false);
  assert.equal(tail.lines.every((l) => l.text.startsWith('{')), true);
});

test('synthesizePhaseSpans yields deterministic ids deduped by span_id', () => {
  const root = mkroot();
  const dir = join(root, '.harness/state/slices/s1/sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '001-s.json'), JSON.stringify({ event_type: 'phase_started', phase: 'implementation', timestamp: '2026-11-17T10:00:00.000Z', slice_id: 's1' }));
  writeFileSync(join(dir, '002-c.json'), JSON.stringify({ event_type: 'phase_completed', phase: 'implementation', timestamp: '2026-11-17T10:30:00.000Z', slice_id: 's1' }));
  const a = synthesizePhaseSpans(root, 's1');
  const b = synthesizePhaseSpans(root, 's1');
  assert.equal(a.length, 1);
  assert.equal(a[0].span_id, b[0].span_id);
  assert.equal(a[0].trace_id, b[0].trace_id);
  assert.equal(a[0].duration_ms, 30 * 60000);
  assert.equal(a[0].attributes.source, 'session_events');
  assert.equal(validateSpan(a[0]).length, 0);
});

test('H-LOOP fires on 3 consecutive same-signature failures; dedup window applies', () => {
  const err = (sig, id, t) => mintSpan({ kind: 'test', slice_id: 's1', phase: 'implementation', process_name: 'gate', start_time_iso: t, end_time_iso: t, duration_ms: 1, status: 'ERROR', writer: 'command-gate', attributes: { failure_signature: sig }, span_id: id });
  const spans = [
    err('test:a.spec', 'aaaa0001', '2026-11-17T10:00:00.000Z'),
    err('test:a.spec', 'aaaa0002', '2026-11-17T10:01:00.000Z'),
    err('test:a.spec', 'aaaa0003', '2026-11-17T10:02:00.000Z'),
  ];
  const findings = evaluateHeuristics(spans, { now: new Date('2026-11-17T10:05:00.000Z') });
  const loop = findings.find((f) => f.heuristic === 'H-LOOP');
  assert.ok(loop);
  assert.equal(loop.failure_signature, 'test:a.spec');
  assert.equal(loop.trigger_span_id, 'aaaa0003');
  const det = detectionSpan(loop);
  assert.equal(det.kind, 'sensor');
  assert.equal(det.writer, 'heuristic-evaluator');
  assert.equal(det.attributes.heuristic, 'H-LOOP');
  assert.equal(validateSpan(det).length, 0);
  // An OK on the signature resets the run.
  const ok = mintSpan({ kind: 'test', slice_id: 's1', phase: 'implementation', process_name: 'gate', start_time_iso: '2026-11-17T10:01:30.000Z', end_time_iso: '2026-11-17T10:01:30.000Z', duration_ms: 1, status: 'OK', writer: 'command-gate', attributes: { failure_signature: 'test:a.spec' } });
  const findings2 = evaluateHeuristics([spans[0], ok, spans[1], spans[2]], { now: new Date('2026-11-17T10:05:00.000Z') });
  assert.equal(findings2.filter((f) => f.heuristic === 'H-LOOP').length, 0);
});

test('evaluator ignores heuristic-evaluator/harness-profile/validator writers', () => {
  const det = mintSpan({ kind: 'sensor', slice_id: 's1', process_name: 'heuristic-evaluator', start_time_iso: '2026-11-17T10:00:00.000Z', end_time_iso: '2026-11-17T10:00:00.000Z', duration_ms: 0, status: 'ERROR', writer: 'heuristic-evaluator', attributes: { failure_signature: 'x', heuristic: 'H-LOOP' } });
  assert.equal(validateSpan(det).length, 0); // evaluator may set heuristic
  const findings = evaluateHeuristics([det, det, det], { now: new Date('2026-11-17T10:05:00.000Z') });
  assert.equal(findings.filter((f) => f.heuristic === 'H-LOOP').length, 0);
});

test('H-SURGE fires on >80KB and on +50% delta; same-signature dedup within a run', () => {
  const turn = (bytes, id, t) => mintSpan({ kind: 'turn', slice_id: 's1', phase: 'implementation', process_name: 'agent-turn', start_time_iso: t, end_time_iso: t, duration_ms: 1, status: 'OK', writer: 'runtime-hook', attributes: { context_bytes_loaded: bytes }, span_id: id });
  // +52.5% delta fires; the later >80KB span shares the signature and dedups.
  const findings = evaluateHeuristics([turn(40000, 'bbbb0001', '2026-11-17T10:00:00.000Z'), turn(61000, 'bbbb0002', '2026-11-17T10:01:00.000Z'), turn(90000, 'bbbb0003', '2026-11-17T10:02:00.000Z')]);
  const surge = findings.filter((f) => f.heuristic === 'H-SURGE');
  assert.equal(surge.length, 1);
  assert.equal(surge[0].trigger_span_id, 'bbbb0002');
  // >80 KB alone fires when no previous turn exists.
  const alone = evaluateHeuristics([turn(90000, 'bbbb0003', '2026-11-17T10:02:00.000Z')]);
  assert.equal(alone.filter((f) => f.heuristic === 'H-SURGE').length, 1);
});
