import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AdrCoverageResult } from '../../src/analysis/analysis.types.ts';
import { adrCoverageView, testBadge } from './rule-coverage.ts';

test('rule-coverage REQ-005: the test badge of a rule', () => {
	const tests = { status: 'ok' as const, byRule: { a: 'passed' as const, b: 'failed' as const }, invalidFiles: [] };
	assert.deepEqual(testBadge(tests, 'a'), { label: 'test passed', tone: 'tone-success' });
	assert.deepEqual(testBadge(tests, 'b'), { label: 'test failed', tone: 'tone-danger' });
	assert.deepEqual(testBadge(tests, 'c'), { label: 'no test', tone: 'tone-warning' });
	assert.deepEqual(testBadge({ ...tests, status: 'unavailable' }, 'a'), { label: 'tests not run', tone: '' });
	assert.equal(testBadge(undefined, 'a'), null);
});

test('rule-coverage REQ-002/005: the ADR tab lists uncovered ADRs with their prompt, covered ADRs, and dangling rules', () => {
	const coverage: AdrCoverageResult = {
		dir: 'docs/decisions',
		source: 'default',
		adrs: [
			{
				id: 'ADR-0001',
				number: 1,
				title: 'Layers',
				status: 'accepted',
				path: 'p1',
				exempt: false,
				active: true,
				rules: ['r1'],
			},
			{
				id: 'ADR-0002',
				number: 2,
				title: 'Money',
				status: 'accepted',
				path: 'p2',
				exempt: false,
				active: true,
				rules: [],
			},
			{
				id: 'ADR-0003',
				number: 3,
				title: 'Hosting',
				status: 'accepted',
				path: 'p3',
				exempt: true,
				active: true,
				rules: [],
			},
		],
		total: 3,
		enforceable: 2,
		covered: 1,
		coverage: 0.5,
		uncovered: [{ id: 'ADR-0002', title: 'Money', path: 'p2', prompt: '# Encode ADR-0002' }],
		dangling: [{ ruleId: 'r9', adr: 'ADR-0009', reason: 'no ADR file' }],
		rulesWithoutAdr: 0,
		unidentified: [],
	};
	const view = adrCoverageView(coverage);
	assert.equal(view?.headline, '1 of 2 enforceable ADRs have a rule (50%) · 3 in docs/decisions');
	assert.equal(view?.tone, 'tone-warning');
	assert.equal(view?.uncovered[0]?.prompt, '# Encode ADR-0002');
	assert.deepEqual(view?.covered, [{ id: 'ADR-0001', title: 'Layers', rules: ['r1'] }]);
	assert.equal(view?.exempt, 1);
	assert.equal(view?.dangling.length, 1);
	assert.match(adrCoverageView({ ...coverage, dir: null })?.headline ?? '', /No ADR folder/);
	assert.equal(adrCoverageView(null), null);
});
