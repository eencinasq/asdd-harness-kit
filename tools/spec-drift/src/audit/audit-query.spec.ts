import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AuditFinding } from './audit.types.ts';
import { queryFindings } from './audit-query.ts';

const f = (id: string, over: Partial<AuditFinding> = {}): AuditFinding => ({
	id,
	check: 'DRIFT-01',
	severity: 'fail',
	message: id,
	slice_id: 's1',
	paths: ['src/a.ts'],
	...over,
});

const findings: AuditFinding[] = [
	f('AUD-00000001'),
	f('AUD-00000002', { severity: 'warn', slice_id: 's2', paths: ['docs/x.md'] }),
	f('AUD-00000003', { check: 'UNOWNED', slice_id: null, paths: ['src/b.ts', 'lib/c.ts'] }),
	f('AUD-00000004', { check: 'SPEC-VERDICT', source: 'inferential', severity: 'advisory', slice_id: 's2' }),
];

test('spec-drift-apps REQ-004: counts per group cover every matching finding', () => {
	const r = queryFindings(findings, {}, 'slice');
	assert.equal(r.total, 4);
	assert.equal(r.matched, 4);
	assert.deepEqual(
		r.groups.map((g) => [g.key, g.count]),
		[
			['s2', 2],
			['(none)', 1],
			['s1', 1],
		],
		'by count, then by key',
	);
	assert.deepEqual(r.groups.find((g) => g.key === 's2')?.by_severity, { warn: 1, advisory: 1 });
});

test('spec-drift-apps REQ-004: filters combine, and path groups use the top-level directory', () => {
	const r = queryFindings(findings, { severity: 'fail', path_prefix: 'src/' }, 'path');
	assert.deepEqual(
		r.findings.map((x) => x.id),
		['AUD-00000001', 'AUD-00000003'],
	);
	assert.deepEqual(
		r.groups.map((g) => [g.key, g.count]),
		[
			['src', 2],
			['lib', 1],
		],
	);
	assert.equal(queryFindings(findings, { source: 'inferential' }).matched, 1);
	assert.equal(queryFindings(findings, { source: 'computational' }).matched, 3, 'no source means computational');
	assert.equal(queryFindings(findings, { check: 'UNOWNED', slice_id: 's1' }).matched, 0);
});

test('spec-drift-apps REQ-004: at most `limit` findings return, paths are capped, the input is not changed', () => {
	const many = Array.from({ length: 30 }, (_, i) =>
		f(`AUD-${String(i).padStart(8, '0')}`, { paths: Array.from({ length: 9 }, (_, j) => `src/f${j}.ts`) }),
	);
	const copy = structuredClone(many);
	const r = queryFindings(many, {}, 'none', 5);
	assert.equal(r.findings.length, 5);
	assert.equal(r.truncated, true);
	assert.equal(r.matched, 30);
	assert.deepEqual(r.groups, [{ key: 'all', count: 30, by_severity: { fail: 30 } }]);
	assert.equal(r.findings[0]?.paths?.length, 5);
	assert.equal(r.findings[0]?.paths_total, 9);
	assert.deepEqual(many, copy);
});
