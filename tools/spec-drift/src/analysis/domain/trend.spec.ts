import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { auditPoint, buildTrend, directionOf, type TrendPoint } from './trend.ts';

const point = (at: string, total: number, groups: Record<string, number>, fresh: number | null = null): TrendPoint => ({
	at,
	label: at,
	total,
	new: fresh,
	groups,
});

describe('spec-drift-adoption REQ-002: trend', () => {
	test('direction: down is better, up is worse, within 5% is flat', () => {
		assert.equal(directionOf(100, 80).direction, 'better');
		assert.equal(directionOf(100, 120).direction, 'worse');
		assert.equal(directionOf(100, 104).direction, 'flat');
		assert.equal(directionOf(0, 3).direction, 'worse');
		assert.equal(directionOf(0, 0).direction, 'flat');
	});

	test('points oldest first, per-key change of first vs last, largest move first', () => {
		const t = buildTrend([
			point('2026-11-10', 12, { 'r.a': 10, 'r.b': 2 }),
			point('2026-11-01', 20, { 'r.a': 15, 'r.b': 5 }),
			point('2026-11-05', 16, { 'r.a': 12, 'r.b': 4 }),
		]);
		assert.deepEqual(
			t.points.map((p) => p.at),
			['2026-11-01', '2026-11-05', '2026-11-10'],
		);
		assert.deepEqual([t.measure, t.direction, t.change], ['total', 'better', -0.4]);
		assert.deepEqual(t.changes, [
			{ key: 'r.a', first: 15, last: 10, delta: -5 },
			{ key: 'r.b', first: 5, last: 2, delta: -3 },
		]);
	});

	test('with a baseline at every point, the measure is new findings', () => {
		const t = buildTrend([point('2026-11-01', 50, {}, 2), point('2026-11-08', 49, {}, 6)]);
		assert.deepEqual([t.measure, t.direction], ['new', 'worse']);
	});

	test('one point or none: no direction', () => {
		assert.equal(buildTrend([point('2026-11-01', 5, {})]).direction, 'unknown');
		assert.deepEqual(buildTrend([]).points, []);
	});

	test('an audit report is a point grouped by check or slice', () => {
		const report = {
			generated_at: '2026-11-02T00:00:00Z',
			findings: [
				{ check: 'DRIFT-01', slice_id: 's1' },
				{ check: 'DRIFT-01', slice_id: null },
			],
		};
		assert.deepEqual(auditPoint('a.json', report, 'check')?.groups, { 'DRIFT-01': 2 });
		assert.deepEqual(auditPoint('a.json', report, 'slice')?.groups, { s1: 1, '(none)': 1 });
		assert.equal(auditPoint('x.json', {}, 'check'), null);
	});
});
