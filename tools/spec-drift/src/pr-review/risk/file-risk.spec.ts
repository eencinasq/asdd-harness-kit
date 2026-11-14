import assert from 'node:assert/strict';
import { test } from 'node:test';

import { churnFromLog, levelOf, rankRisk, readFirst, riskPromptSection, scopeCovers } from './file-risk.ts';

test('spec-drift-depth REQ-002: a feature scope covers a file by path, folder, or glob', () => {
	assert.ok(scopeCovers('src/a.ts', 'src/a.ts'));
	assert.ok(scopeCovers('src/auth', 'src/auth/login.ts'));
	assert.ok(scopeCovers('src/auth/', 'src/auth/login.ts'));
	assert.ok(scopeCovers('./src/auth', 'src/auth/login.ts'));
	assert.ok(scopeCovers('src/**/*.ts', 'src/auth/login.ts'));
	assert.ok(!scopeCovers('src/auth', 'src/authz/x.ts'));
	assert.ok(!scopeCovers('', 'src/a.ts'));
});

test('spec-drift-depth REQ-002: level is high on any finding or score >= 10, medium from 4', () => {
	assert.equal(levelOf(1, 1), 'high');
	assert.equal(levelOf(10, 0), 'high');
	assert.equal(levelOf(4, 0), 'medium');
	assert.equal(levelOf(3, 0), 'low');
});

test('spec-drift-depth REQ-002: churn counts commits per file from git log', () => {
	const churn = churnFromLog('\nsrc/a.ts\nsrc/b.ts\n\nsrc/a.ts\n');
	assert.equal(churn.get('src/a.ts'), 2);
	assert.equal(churn.get('src/b.ts'), 1);
});

test('spec-drift-depth REQ-002: files are ranked by churn + 2 × links + 5 × findings, with reasons', () => {
	const risk = rankRisk({
		files: ['src/quiet.ts', 'src/auth/login.ts', 'src/hot.ts', 'src/hot.ts'],
		churn: new Map([
			['src/hot.ts', 6],
			['src/auth/login.ts', 1],
		]),
		features: [
			{ id: 'auth/TASK-001', scope_paths: ['src/auth'], req_ids: ['REQ-001', 'REQ-002'] },
			{ id: 'auth/TASK-002', scope_paths: ['docs'], req_ids: ['REQ-003'] },
		],
		architectureFindings: [{ path: 'src/auth/login.ts' }],
		audit: {
			findings: [
				{ paths: ['src/hot.ts'], check: 'UNOWNED' },
				{ paths: ['src/auth/login.ts'], check: 'DRIFT-01' },
			],
			hotspots: [{ path: 'src/other.ts' }, { path: 'src/hot.ts' }],
		},
	});
	assert.deepEqual(
		risk.files.map((f) => [f.path, f.score, f.level]),
		[
			['src/auth/login.ts', 1 + 2 * 2 + 5 * 2, 'high'],
			['src/hot.ts', 6, 'medium'],
			['src/quiet.ts', 0, 'low'],
		],
	);
	const [login, hot] = risk.files;
	assert.deepEqual(login?.reasons, [
		'1 commit in 90 days',
		'2 requirement links (auth/TASK-001)',
		'1 architecture finding in this PR',
		'1 finding in the latest audit',
	]);
	assert.deepEqual(hot?.reasons, ['6 commits in 90 days', 'audit hotspot #2'], 'UNOWNED does not count');
	assert.equal(hot?.hotspot, 2);
	assert.deepEqual(risk.unavailable, []);
	assert.deepEqual(
		readFirst(risk).map((f) => f.path),
		['src/auth/login.ts', 'src/hot.ts'],
		'files without a signal are not "read first"',
	);
	const section = riskPromptSection(risk);
	assert.match(section, /^## Read first \(risk\)/);
	assert.match(section, /- `src\/auth\/login\.ts` — high, score 15: 1 commit in 90 days; 2 requirement links/);
	assert.doesNotMatch(section, /quiet/);
});

test('spec-drift-depth REQ-002: missing sources count 0 and are reported; no signal means no prompt section', () => {
	const risk = rankRisk({ files: ['a.ts', 'b.ts'] });
	assert.deepEqual(risk.unavailable, ['churn', 'requirements', 'architecture', 'audit']);
	assert.deepEqual(
		risk.files.map((f) => [f.path, f.score, f.level]),
		[
			['a.ts', 0, 'low'],
			['b.ts', 0, 'low'],
		],
	);
	assert.equal(riskPromptSection(risk), '');
});
