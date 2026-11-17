/**
 * telemetry-emitters TASK-003 — telemetry-lib span core: ids, buildSpan, fail-open emit, validateSpan, readTail.
 * REQ-001…REQ-006, REQ-022. TASK-004 — policy: attribute(), guidanceTarget(), skillTarget() (REQ-015, REQ-017).
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
  readTail,
  skillTarget,
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
