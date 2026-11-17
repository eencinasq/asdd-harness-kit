/**
 * telemetry-emitters TASK-003 — telemetry-lib span core: ids, buildSpan, fail-open emit, validateSpan, readTail.
 * REQ-001…REQ-006, REQ-022. Every case runs in a temp dir, never against the repo's .harness/state/telemetry/.
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
  buildSpan,
  childOf,
  emit,
  readTail,
  startTrace,
  validateSpan,
} from './telemetry-lib.mjs';

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
