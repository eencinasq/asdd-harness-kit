import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderPipelineHtml } from './pipeline-html.mjs';

test('REQ-002 REQ-003 HTML dashboard includes metrics cards and slice rows (same metrics as pipeline_status)', () => {
  const html = renderPipelineHtml({
    metrics: {
      generated_at: '2026-11-13T00:00:00.000Z',
      slices: { total: 2, done: 1, in_progress: 1, lite_share: 0.5, escalation_rate: 0.5 },
      stop_fail: { episodes: 1, by_code: { 'DRIFT-01': 1 } },
      open_patterns: 0,
      phase_median_hours: {},
    },
    slices: [
      { slice_id: 'a', mode: 'lite', phase: 'qa', status: 'DONE', active_features: 0 },
      {
        slice_id: 'b',
        mode: 'escalated',
        phase: 'implementation',
        status: 'in_progress',
        active_features: 1,
        escalation_required: true,
        escalation_signals: 1,
      },
    ],
  });
  assert.match(html, /ASDD pipeline/);
  assert.match(html, /Lite share/);
  assert.match(html, /<td>a<\/td>/);
  assert.match(html, /DRIFT-01×1/);
  assert.match(html, /1 signal\(s\)/);
});

test('cost-metrics REQ-001 REQ-003 HTML shows tokens and cost by model and runtime, unknown runtimes marked', () => {
  const row = (extra) => ({ input_tokens: 150, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0, usd: 0.00035, ...extra });
  const html = renderPipelineHtml({
    metrics: {
      generated_at: '2026-11-17T00:00:00.000Z',
      slices: { total: 0, done: 0, in_progress: 0, lite_share: null, escalation_rate: null },
      stop_fail: { episodes: 0, by_code: {} },
      open_patterns: 0,
      phase_median_hours: {},
      cost: {
        source: ['claude-transcript'],
        totals: row({}),
        by_slice: [row({ slice_id: 'a' })],
        by_phase: [row({ phase: 'spec' })],
        by_model: [row({ model: '<opus>' })],
        by_runtime: [row({ runtime: 'claude', unknown: false }), { runtime: 'cursor', input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null, usd: null, unknown: true }],
        unknown_runtimes: ['cursor'],
      },
    },
    slices: [],
  });
  assert.match(html, /<span>Tokens<\/span><strong>170<\/strong>/);
  assert.match(html, /<span>Cost \(USD\)<\/span><strong>\$0\.00035<\/strong>/);
  assert.match(html, /&lt;opus&gt;/, 'model ids are escaped');
  assert.match(html, /cursor<\/td><td colspan="5">unknown — no token source; not estimated/);
});
