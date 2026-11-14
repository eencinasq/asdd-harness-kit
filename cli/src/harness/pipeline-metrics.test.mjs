/**
 * Synthetic fixtures for ASDD-ROADMAP P0.1 / REQ-002:
 * green lite DONE, stop-FAIL sensors, escalated lite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computePipelineMetrics, phaseDurationsHours, stopFailCounts } from './pipeline-metrics.mjs';

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
