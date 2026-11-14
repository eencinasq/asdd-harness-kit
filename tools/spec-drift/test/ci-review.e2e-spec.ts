/**
 * spec-drift-demand REQ-004 end to end: `spec-drift ci-review` prints the workflow (writes nothing), and `gh` gets
 * GH_TOKEN only in CI.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { parse } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const cli = (...args: string[]) =>
	spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts', 'ci-review', ...args], {
		cwd: ROOT,
		encoding: 'utf8',
	});

test('spec-drift-demand REQ-004: ci-review prints a workflow for the given kit ref and the setup on stderr', () => {
	const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
	const r = cli('--kit-repo', 'acme/kit', '--kit-ref', '0123abc');
	assert.equal(r.status, 0, r.stderr);
	const wf = parse(r.stdout) as Record<string, any>;
	const kit = (wf['jobs']['review']['steps'] as Record<string, any>[]).find((s) => s['with']?.['repository']);
	assert.deepEqual(kit?.['with'], { repository: 'acme/kit', ref: '0123abc', path: '.spec-drift-kit' });
	assert.match(r.stderr, /SPEC_DRIFT_REVIEWER_TOKEN: a fine-grained token of the person who submits/);
	assert.equal(
		execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }),
		before,
		'nothing written',
	);
	const bad = cli('--kit-repo', 'not a repo');
	assert.equal(bad.status, 2);
	assert.match(bad.stderr, /--kit-repo must be owner\/name/);
});

test('spec-drift-demand REQ-004: gh keeps GH_TOKEN only when CI=true', () => {
	const probe = (ci: string | undefined) =>
		spawnSync(
			process.execPath,
			[
				'--import',
				'tsx',
				'-e',
				"import('./src/common/process/process-runner.service.ts').then((m) => console.log(m.nonInteractiveEnv().GH_TOKEN ?? '-'))",
			],
			{ cwd: ROOT, encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'reviewer-token', CI: ci ?? '' } },
		).stdout.trim();
	assert.equal(probe('true'), 'reviewer-token');
	assert.equal(probe(undefined), '-', 'a local GUI token is still dropped');
});
