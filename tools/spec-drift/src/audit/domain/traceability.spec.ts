import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildMatrix,
	expandOwned,
	isTestPath,
	MAX_FILES,
	matrixMarkdown,
	prsByFileFromLog,
	RECORD_SEPARATOR,
	type TraceFeature,
} from './traceability.ts';

const RS = RECORD_SEPARATOR;

test('spec-drift-depth REQ-001: test files are recognized by path in each language', () => {
	for (const f of [
		'src/a.spec.ts',
		'src/a.test.js',
		'test/x.e2e-spec.ts',
		'pkg/a_test.go',
		'app/test_views.py',
		'app/views_test.py',
		'src/test/java/FooTest.java',
		'lib/__tests__/a.ts',
		'FooTests.kt',
	]) {
		assert.ok(isTestPath(f), f);
	}
	for (const f of ['src/a.ts', 'src/testing.ts', 'contest/a.py', 'src/spectrum.ts']) assert.ok(!isTestPath(f), f);
});

test('spec-drift-depth REQ-001: PR numbers come from squash and merge commit subjects', () => {
	const log = [
		'',
		'feat: add login (#12)\n\nsrc/login.ts\nsrc/login.spec.ts\n',
		'Merge pull request #7 from org/branch\n\nsrc/login.ts\n',
		'chore: local commit\n\nsrc/other.ts\n',
		'fix: (#3) in the middle is not a PR\n\nsrc/other.ts\n',
	].join(RS);
	const prs = prsByFileFromLog(log);
	assert.deepEqual([...(prs.get('src/login.ts') ?? [])].sort(), [12, 7].sort());
	assert.deepEqual([...(prs.get('src/login.spec.ts') ?? [])], [12]);
	assert.equal(prs.has('src/other.ts'), false);
});

test('spec-drift-depth REQ-001: owned folders and globs expand to tracked files', () => {
	const tracked = ['src/a/x.ts', 'src/a/x.spec.ts', 'src/ab.ts', 'docs/r.md'];
	assert.deepEqual(expandOwned('src/a', tracked), ['src/a/x.ts', 'src/a/x.spec.ts']);
	assert.deepEqual(expandOwned('src/a/', tracked), ['src/a/x.ts', 'src/a/x.spec.ts']);
	assert.deepEqual(expandOwned('src/**/*.ts', tracked), ['src/a/x.ts', 'src/a/x.spec.ts', 'src/ab.ts']);
	assert.deepEqual(expandOwned('docs/r.md', tracked), ['docs/r.md']);
	assert.deepEqual(expandOwned('missing/file.ts', tracked), ['missing/file.ts'], 'kept as declared');
	assert.deepEqual(expandOwned('src/a', []), ['src/a'], 'no git: kept as declared');
});

test('spec-drift-depth REQ-001: one row per requirement with features, tests, PRs, gaps, and totals', () => {
	const feature = (id: string, status: string, reqs: string[], owns: string[]): TraceFeature => ({
		key: `feature:s:${id}`,
		slice: 's',
		id,
		status,
		reqs,
		owns,
	});
	const { rows, totals } = buildMatrix({
		requirements: [
			{ key: 'req:s:REQ-001', slice: 's', id: 'REQ-001', title: 'Login' },
			{ key: 'req:s:REQ-002', slice: 's', id: 'REQ-002', title: 'Logout' },
			{ key: 'req:s:REQ-003', slice: 's', id: 'REQ-003', title: 'Audit | log' },
		],
		features: [
			feature('TASK-002', 'in_progress', ['req:s:REQ-002'], ['src/logout.ts']),
			feature('TASK-001', 'passing', ['req:s:REQ-001'], ['src/login']),
		],
		trackedFiles: ['src/login/a.ts', 'src/login/a.spec.ts', 'src/logout.ts'],
		prsByFile: new Map([
			['src/login/a.ts', new Set([12])],
			['src/login/a.spec.ts', new Set([12, 3])],
		]),
	});
	assert.deepEqual(rows[0], {
		slice: 's',
		req_id: 'REQ-001',
		title: 'Login',
		features: [{ id: 'TASK-001', status: 'passing' }],
		files: ['src/login/a.spec.ts', 'src/login/a.ts'],
		file_count: 2,
		tests: ['src/login/a.spec.ts'],
		prs: [3, 12],
		gaps: [],
	});
	assert.deepEqual(rows[1]?.gaps, ['no-test', 'not-passing']);
	assert.deepEqual(rows[2]?.gaps, ['no-feature', 'no-test']);
	assert.deepEqual(totals, { requirements: 3, with_feature: 2, tested: 1, passing: 1, with_gaps: 2 });

	const md = matrixMarkdown(rows, totals);
	assert.match(md, /\| s \| REQ-001 \| Login \| TASK-001 \(passing\) \| src\/login\/a\.spec\.ts \| #3, #12 \| none \|/);
	assert.match(md, /Audit \\\| log/, 'pipes in cells are escaped');
	assert.match(md, /^Requirements: 3 · with a feature: 2/);
});

test('spec-drift-depth REQ-001: the file list is capped and counted', () => {
	const tracked = Array.from({ length: MAX_FILES + 5 }, (_, i) => `src/m/f${String(i).padStart(3, '0')}.ts`);
	const { rows } = buildMatrix({
		requirements: [{ key: 'r', slice: 's', id: 'REQ-001', title: 't' }],
		features: [{ key: 'f', slice: 's', id: 'TASK-001', status: 'passing', reqs: ['r'], owns: ['src/m'] }],
		trackedFiles: tracked,
		prsByFile: new Map(),
	});
	assert.equal(rows[0]?.files.length, MAX_FILES);
	assert.equal(rows[0]?.file_count, MAX_FILES + 5);
});
