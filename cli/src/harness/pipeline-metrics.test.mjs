/**
 * Synthetic fixtures for ASDD-ROADMAP P0.1 / REQ-002:
 * green lite DONE, stop-FAIL sensors, escalated lite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computePipelineMetrics, formatPipelineMetrics, phaseDurationsHours, stopFailCounts } from './pipeline-metrics.mjs';

const t0 = '2026-11-01T10:00:00.000Z';
const t1 = '2026-11-01T12:00:00.000Z'; // +2h
const t2 = '2026-11-01T16:00:00.000Z'; // +4h from t1

test('phaseDurationsHours: from phase_started through phase_completed', () => {
  const hours = phaseDurationsHours([
    { event_type: 'phase_started', phase: 'discovery', timestamp: t0 },
    { event_type: 'phase_completed', phase: 'spec', timestamp: t1 },
    { event_type: 'phase_completed', phase: 'design', timestamp: t2 },
  ]);
  assert.deepEqual(hours.spec, [2]);
  assert.deepEqual(hours.design, [4]);
});

test('stopFailCounts: counts sensor: episodes by DRIFT code', () => {
  const { episodes, by_code } = stopFailCounts([
    {
      data: {
        signatures: {
          'sensor:DRIFT-01:docs': { episodes: [{ at: t0 }, { at: t1 }] },
          'sensor:DRIFT-02:src': { episodes: [{ at: t0 }] },
          'warn:QG-X:area': { episodes: [{ at: t0 }] },
        },
      },
    },
  ]);
  assert.equal(episodes, 3);
  assert.deepEqual(by_code, { 'DRIFT-01': 2, 'DRIFT-02': 1 });
});

test('metrics-data-quality REQ-001 stopFailCounts: uncoded sensor signatures count under other', () => {
  const { episodes, by_code } = stopFailCounts([
    {
      data: {
        signatures: {
          'sensor:QG-LEARN-04': { episodes: [{ at: t0 }] },
          'sensor:<path>: feature TASK-N missing user_visible_behavior': { episodes: [{ at: t0 }, { at: t1 }] },
          'sensor:lite slice "*" cannot complete with open escalation signals (EN-scope-spread)': { episodes: [{ at: t0 }] },
        },
      },
    },
  ]);
  assert.equal(episodes, 4);
  assert.deepEqual(by_code, { 'QG-LEARN-04': 1, other: 3 });
});

test('REQ-002 green lite DONE: lite_share 1, escalation_rate 0', () => {
  const m = computePipelineMetrics({
    slices: [
      {
        slice_id: 'hello',
        status: 'DONE',
        mode: 'lite',
        escalated_from_lite: false,
        escalation_required: false,
      },
    ],
    sessionsBySlice: {
      hello: [
        { event_type: 'phase_started', phase: 'discovery', timestamp: t0 },
        { event_type: 'phase_completed', phase: 'spec', timestamp: t1 },
        { event_type: 'phase_completed', phase: 'knowledge', timestamp: t2 },
      ],
    },
    summaries: [],
    patterns: [],
  });
  assert.equal(m.slices.done, 1);
  assert.equal(m.slices.lite_done, 1);
  assert.equal(m.slices.lite_share, 1);
  assert.equal(m.slices.escalation_rate, 0);
  assert.equal(m.stop_fail.episodes, 0);
  assert.equal(m.open_patterns, 0);
  assert.equal(m.phase_median_hours.spec, 2);
});

test('REQ-002 stop FAILs from learning summaries', () => {
  const m = computePipelineMetrics({
    slices: [{ slice_id: 'a', status: 'in_progress', mode: 'lite' }],
    sessionsBySlice: { a: [] },
    summaries: [
      {
        data: {
          signatures: {
            'sensor:DRIFT-01:cli': { episodes: [{ at: t0 }, { at: t1 }, { at: t2 }] },
          },
        },
      },
    ],
    patterns: [{ id: 'LP-1', status: 'open' }],
  });
  assert.equal(m.stop_fail.episodes, 3);
  assert.equal(m.stop_fail.by_code['DRIFT-01'], 3);
  assert.equal(m.open_patterns, 1);
});

test('REQ-002 escalated lite raises escalation_rate and lowers lite_share', () => {
  const m = computePipelineMetrics({
    slices: [
      { slice_id: 'ok', status: 'DONE', mode: 'lite', escalated_from_lite: false },
      {
        slice_id: 'grew',
        status: 'DONE',
        mode: 'escalated',
        escalated_from_lite: true,
        escalation_required: false,
      },
    ],
    sessionsBySlice: { ok: [], grew: [] },
    summaries: [],
    patterns: [],
  });
  assert.equal(m.slices.lite_done, 1);
  assert.equal(m.slices.lite_share, 0.5);
  assert.equal(m.slices.escalated, 1);
  assert.equal(m.slices.escalation_rate, 0.5);
});

const usageSpan = (end, slice, phase, models) => ({
  kind: 'hook',
  runtime: 'claude',
  slice_id: slice,
  phase,
  end_time_iso: end,
  attributes: { outcome: 'pass', usage: { session_id: 's1', models } },
});
const tok = (input, output) => ({ input_tokens: input, output_tokens: output, cache_read_tokens: 0, cache_write_tokens: 0, messages: 1 });

test('cost-metrics REQ-001 REQ-002 REQ-004 metrics.cost: per slice, phase, model and runtime in the JSON contract', () => {
  const m = computePipelineMetrics({
    slices: [],
    summaries: [],
    patterns: [],
    spans: [usageSpan(t0, 'a', 'spec', { opus: tok(100, 10) }), usageSpan(t1, 'a', 'design', { opus: tok(150, 20) })],
    prices: { models: { opus: { input: 1, output: 10, cache_read: 0, cache_write: 0 } } },
    runtimes: ['claude', 'cursor'],
  });
  assert.deepEqual(Object.keys(m.cost), ['source', 'totals', 'by_slice', 'by_phase', 'by_model', 'by_runtime', 'unknown_runtimes']);
  assert.deepEqual(m.cost.totals, { input_tokens: 150, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0, usd: 0.00035 });
  assert.deepEqual(m.cost.by_phase.map((r) => [r.phase, r.input_tokens]), [['spec', 100], ['design', 50]]);
  assert.deepEqual(m.cost.unknown_runtimes, ['cursor']);
  const text = formatPipelineMetrics(m);
  assert.match(text, /tokens\s+in 150 · out 20 · cache read 0 · cache write 0 · \$0\.00035/);
  assert.match(text, /by model\s+opus 170/);
  assert.match(text, /unknown\s+cursor \(no token source; not estimated\)/);
});

test('cost-metrics REQ-003 metrics.cost without usage data: zero totals, null usd, unknown runtimes listed', () => {
  const m = computePipelineMetrics({ slices: [], summaries: [], patterns: [], spans: [], runtimes: ['cursor', 'claude'] });
  assert.deepEqual(m.cost.totals, { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, usd: null });
  assert.deepEqual(m.cost.unknown_runtimes, ['cursor']);
  assert.match(formatPipelineMetrics(m), /tokens\s+— \(no usage recorded yet; Claude Code records it at Stop\)/);
});
