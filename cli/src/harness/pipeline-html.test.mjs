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
