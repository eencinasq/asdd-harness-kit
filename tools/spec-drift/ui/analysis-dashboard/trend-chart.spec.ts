import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ScanSummary } from '../../src/analysis/analysis.types.ts';
import { CHART, nearestIndex, niceMax, trendModel } from './trend-chart.ts';

const trend = (
	points: [string, number, number | null][],
	direction: 'better' | 'worse' | 'flat' | 'unknown',
	change: number | null,
) =>
	({
		points: points.map(([at, total, fresh]) => ({ at, label: `${at}.json`, total, new: fresh })),
		measure: points.every(([, , n]) => n !== null) ? 'new' : 'total',
		direction,
		change,
	}) as ScanSummary['trend'];

test('spec-drift-adoption REQ-002: the chart model plots one series on a readable scale and says which way it goes', () => {
	assert.deepEqual([niceMax(0), niceMax(7), niceMax(13), niceMax(24), niceMax(120)], [2, 8, 15, 30, 150]);
	const m = trendModel(
		trend(
			[
				['2026-11-01', 20, null],
				['2026-11-08', 16, null],
				['2026-11-15', 12, null],
			],
			'better',
			-0.4,
		),
	);
	assert.equal(m?.title, 'Findings per snapshot');
	assert.equal(m?.yMax, 20);
	assert.equal(m?.points[0]?.x, CHART.left);
	assert.equal(m?.points.at(-1)?.x, CHART.width - CHART.right);
	assert.ok((m?.points[0]?.y ?? 0) < (m?.points.at(-1)?.y ?? 0), 'a lower value sits lower');
	assert.match(m?.path ?? '', /^M40\.0,\d+\.\d L/);
	assert.deepEqual(m?.verdict, { text: 'Going down — better: 20 → 12 (-40%)', tone: 'tone-success', icon: '↓' });
	const withBaseline = trendModel(
		trend(
			[
				['2026-11-01', 50, 2],
				['2026-11-08', 49, 6],
			],
			'worse',
			2,
		),
	);
	assert.equal(withBaseline?.title, 'New findings (against the baseline) per snapshot');
	assert.equal(withBaseline?.verdict.tone, 'tone-warning');
	assert.equal(trendModel(null), null);
	assert.match(trendModel(trend([['2026-11-01', 3, null]], 'unknown', null))?.verdict.text ?? '', /record another/);
});

test('spec-drift-adoption REQ-002: the crosshair snaps to the nearest point', () => {
	assert.equal(nearestIndex([40, 300, 536], 200), 1);
	assert.equal(nearestIndex([40, 300, 536], 0), 0);
	assert.equal(nearestIndex([40, 300, 536], 999), 2);
});
