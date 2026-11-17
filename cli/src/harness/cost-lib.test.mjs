import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { costFromSpans, loadPrices, readTranscriptUsage, readUsageSpans, transcriptUsage, usageAttribute } from './cost-lib.mjs';

const line = (o) => `${JSON.stringify(o)}\n`;
const assistant = (id, model, usage, sessionId = 's-1') => line({ type: 'assistant', sessionId, message: { id, model, role: 'assistant', usage } });
const u = (input, output, cacheRead = 0, cacheWrite = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
});

test('cost-metrics REQ-001 transcriptUsage sums per model, once per message id, assistant entries only', () => {
  const text = [
    line({ type: 'user', sessionId: 's-1', message: { role: 'user', content: 'hi' } }),
    assistant('msg_1', 'claude-opus-5-5', u(100, 20, 1000, 50)),
    assistant('msg_1', 'claude-opus-5-5', u(100, 20, 1000, 50)), // same message, second content block
    assistant('msg_2', 'claude-opus-5-5', u(10, 5)),
    assistant('msg_3', 'claude-haiku-4-5', u(7, 3)),
    assistant('msg_4', '<synthetic>', u(0, 0)),
    'not json\n',
  ].join('');
  const usage = transcriptUsage(text);
  assert.equal(usage.session_id, 's-1');
  assert.deepEqual(usage.models['claude-opus-5-5'], { input_tokens: 110, output_tokens: 25, cache_read_tokens: 1000, cache_write_tokens: 50, messages: 2 });
  assert.deepEqual(usage.models['claude-haiku-4-5'], { input_tokens: 7, output_tokens: 3, cache_read_tokens: 0, cache_write_tokens: 0, messages: 1 });
  assert.equal(Object.hasOwn(usage.models, '<synthetic>'), false);
});

test('cost-metrics REQ-001 readTranscriptUsage reads only a regular .jsonl file within the size cap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cost-lib-'));
  try {
    const ok = join(dir, 'session.jsonl');
    writeFileSync(ok, assistant('m', 'claude-opus-5-5', u(1, 2)));
    assert.equal(readTranscriptUsage(ok).models['claude-opus-5-5'].output_tokens, 2);
    assert.equal(readTranscriptUsage(join(dir, 'missing.jsonl')), null);
    assert.equal(readTranscriptUsage(dir), null, 'a directory');
    const txt = join(dir, 'session.txt');
    writeFileSync(txt, assistant('m', 'x', u(1, 2)));
    assert.equal(readTranscriptUsage(txt), null, 'not .jsonl');
    assert.equal(readTranscriptUsage(ok, { maxBytes: 4 }), null, 'over the cap');
    assert.equal(readTranscriptUsage(undefined), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cost-metrics REQ-001 usageAttribute keeps at most 8 models, largest first, and is null without usage', () => {
  const models = {};
  for (let i = 0; i < 10; i += 1) models[`m${i}`] = { input_tokens: i, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, messages: 1 };
  const attr = usageAttribute({ session_id: 's', models });
  assert.equal(attr.session_id, 's');
  assert.deepEqual(Object.keys(attr.models), ['m9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2']);
  assert.equal(usageAttribute({ session_id: 's', models: {} }), null);
  assert.equal(usageAttribute(null), null);
});

const snap = (end, slice, phase, sessionId, models, runtime = 'claude') => ({
  kind: 'hook',
  process_name: 'verify-on-stop',
  runtime,
  slice_id: slice,
  phase,
  end_time_iso: end,
  attributes: { outcome: 'pass', usage: { session_id: sessionId, models } },
});
const m = (input, output, cacheRead = 0, cacheWrite = 0) => ({ input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, messages: 1 });

test('cost-metrics REQ-001 REQ-002 cumulative snapshots: per-model deltas go to the slice/phase of each snapshot', () => {
  const spans = [
    snap('2026-11-17T10:00:00Z', 'a', 'design', 's1', { opus: m(100, 10) }),
    snap('2026-11-17T11:00:00Z', 'a', 'implementation', 's1', { opus: m(300, 40), haiku: m(5, 5) }),
    snap('2026-11-17T12:00:00Z', 'b', 'spec', 's2', { opus: m(50, 5) }),
    snap('2026-11-17T13:00:00Z', 'b', 'spec', 's2', { opus: m(20, 2) }), // decrease: a new baseline
    { kind: 'command', runtime: 'cursor', attributes: { verdict: 'allow' } },
  ];
  const c = costFromSpans(spans, { runtimes: ['claude', 'cursor'] });
  assert.deepEqual(c.source, ['claude-transcript']);
  assert.equal(c.totals.input_tokens, 300 + 5 + 50 + 20);
  assert.equal(c.totals.output_tokens, 40 + 5 + 5 + 2);
  const slice = Object.fromEntries(c.by_slice.map((r) => [r.slice_id, r.input_tokens]));
  assert.deepEqual(slice, { a: 305, b: 70 });
  const phase = Object.fromEntries(c.by_phase.map((r) => [r.phase, r.input_tokens]));
  assert.deepEqual(phase, { design: 100, implementation: 205, spec: 70 });
  const model = Object.fromEntries(c.by_model.map((r) => [r.model, r.input_tokens]));
  assert.deepEqual(model, { opus: 370, haiku: 5 });
  const runtime = Object.fromEntries(c.by_runtime.map((r) => [r.runtime, r]));
  assert.equal(runtime.claude.unknown, false);
  assert.equal(runtime.claude.input_tokens, 375);
  assert.equal(runtime.cursor.unknown, true);
  assert.equal(runtime.cursor.input_tokens, null, 'unknown is never estimated');
  assert.deepEqual(c.unknown_runtimes, ['cursor']);
});

test('cost-metrics REQ-003 USD only from the price table; a model missing from it makes usd null upward', () => {
  const spans = [snap('2026-11-17T10:00:00Z', 'a', 'spec', 's1', { opus: m(1_000_000, 1_000_000, 1_000_000, 1_000_000), mystery: m(10, 10) })];
  const priced = costFromSpans(spans, {
    runtimes: ['claude'],
    prices: { models: { opus: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 }, mystery: { input: 1, output: 1, cache_read: 0, cache_write: 0 } } },
  });
  assert.equal(priced.by_model.find((r) => r.model === 'opus').usd, 22.05);
  assert.equal(priced.totals.usd, 22.05002);
  const partial = costFromSpans(spans, { runtimes: ['claude'], prices: { models: { opus: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } } } });
  assert.equal(partial.by_model.find((r) => r.model === 'opus').usd, 22.05);
  assert.equal(partial.by_model.find((r) => r.model === 'mystery').usd, null);
  assert.equal(partial.by_slice[0].usd, null);
  assert.equal(partial.totals.usd, null);
  assert.equal(costFromSpans(spans, { runtimes: ['claude'] }).totals.usd, null, 'no table, no USD');
});

test('cost-metrics REQ-003 REQ-004 no usage data: zero totals, empty arrays, unknown runtimes listed (not claude)', () => {
  const c = costFromSpans([], { runtimes: ['cursor', 'claude', 'devin'] });
  assert.deepEqual(c, {
    source: [],
    totals: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, usd: null },
    by_slice: [],
    by_phase: [],
    by_model: [],
    by_runtime: [],
    unknown_runtimes: ['cursor', 'devin'],
  });
});

test('cost-metrics REQ-001 loadPrices and readUsageSpans read the project files, tolerating absence and bad lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'cost-root-'));
  try {
    assert.equal(loadPrices(root), null);
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(join(root, '.harness/config/model-prices.json'), JSON.stringify({ models: { opus: { input: 1, output: 2, cache_read: 0, cache_write: 0 } } }));
    assert.equal(loadPrices(root).models.opus.output, 2);
    assert.deepEqual(readUsageSpans(root), []);
    mkdirSync(join(root, '.harness/state/telemetry'), { recursive: true });
    const usage = snap('2026-11-17T10:00:00Z', 'a', 'spec', 's1', { opus: m(1, 1) });
    writeFileSync(join(root, '.harness/state/telemetry/spans.jsonl'), [JSON.stringify(usage), '{bad', JSON.stringify({ kind: 'command', attributes: {} })].join('\n') + '\n');
    const spans = readUsageSpans(root);
    assert.equal(spans.length, 2, 'every parsable span (runtimes without usage still count)');
    assert.ok(spans.some((s) => s.attributes?.usage));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
