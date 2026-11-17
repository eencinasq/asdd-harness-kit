import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PROFILE = join(ROOT, 'cli/src/harness/profile.mjs');

const run = (cwd, args) => spawnSync(process.execPath, [PROFILE, ...args], { cwd, encoding: 'utf8' });
const span = (over = {}) => JSON.stringify({
  schema_version: '1.0', trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), parent_span_id: null,
  kind: 'command', slice_id: 'demo', phase: 'implementation', process_name: 'smoke', runtime: 'cli',
  start_time_iso: '2026-01-01T00:00:00.000Z', end_time_iso: '2026-01-01T00:00:01.000Z', duration_ms: 1000,
  status: 'OK', ...over, attributes: { trace_source: 'self', ...(over.attributes ?? {}) }, writer: 'test', events: [],
});

test('exit 2 on usage error', () => {
  const r = run(mkdtempSync(join(tmpdir(), 'p-')), []);
  assert.equal(r.status, 2);
});

test('exit 3 when no spans exist for the slice', () => {
  const r = run(mkdtempSync(join(tmpdir(), 'p-')), ['--slice', 'demo']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /no spans/i);
});

test('slice rollup writes profiling.json with metrics + surfaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'p-'));
  const dir = join(root, '.harness/state/telemetry');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spans.jsonl'), [span(), span({ span_id: 'c'.repeat(16), kind: 'test', duration_ms: 2000, attributes: { boot_duration_ms: 1200 } })].join('\n') + '\n');
  const r = run(root, ['--slice', 'demo']);
  assert.equal(r.status, 0);
  const out = JSON.parse(readFileSync(join(dir, 'slices/demo/profiling.json'), 'utf8'));
  assert.equal(out.slice_id, 'demo');
  assert.equal(out.schema_version, '1.0');
  assert.ok(out.metrics.total_span_time_ms >= 3000);
  assert.ok(Array.isArray(out.surfaces));
});

test('--bottlenecks ranks slices and exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'p-'));
  const dir = join(root, '.harness/state/telemetry');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spans.jsonl'), span() + '\n');
  const r = run(root, ['--bottlenecks']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /demo/);
});

test('--bottlenecks exits 3 on empty stream', () => {
  const r = run(mkdtempSync(join(tmpdir(), 'p-')), ['--bottlenecks']);
  assert.equal(r.status, 3);
});

test('malformed lines are skipped by the readout', () => {
  const root = mkdtempSync(join(tmpdir(), 'p-'));
  const dir = join(root, '.harness/state/telemetry');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spans.jsonl'), '{"kind":"bogus"}\n' + span() + '\n');
  const r = run(root, ['--slice', 'demo', '--json']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.slice_id, 'demo');
});
