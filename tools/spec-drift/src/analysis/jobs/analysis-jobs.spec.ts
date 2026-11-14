import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AnalysisJobs, JOB_TTL_MS, JobLimitError, MAX_JOBS } from './analysis-jobs.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('spec-drift-depth REQ-004: a job runs in the background, keeps its last progress, and returns its result', async () => {
	const jobs = new AnalysisJobs<{ total: number }>();
	let finish: (v: { total: number }) => void = () => undefined;
	const started = jobs.start('analyze_architecture', (progress) => {
		progress('Running Semgrep');
		progress('Building drift report');
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	assert.equal(started.status, 'running');
	assert.equal(started.finishedAt, null);
	await settle();
	assert.equal(jobs.get(started.id)?.progress, 'Building drift report');
	finish({ total: 3 });
	await settle();
	const done = jobs.get(started.id);
	assert.equal(done?.status, 'done');
	assert.deepEqual(done?.result, { total: 3 });
	assert.ok(done?.finishedAt);
	assert.equal(jobs.list()[0]?.result, undefined, 'the list leaves results out');
	assert.equal(jobs.get('nope'), null);
});

test('spec-drift-depth REQ-004: a failed job keeps the error message', async () => {
	const jobs = new AnalysisJobs<number>();
	const job = jobs.start('analyze_standards', async () => {
		throw new Error('semgrep not installed');
	});
	await settle();
	await settle();
	assert.deepEqual(
		{ status: jobs.get(job.id)?.status, error: jobs.get(job.id)?.error },
		{ status: 'failed', error: 'semgrep not installed' },
	);
});

test('spec-drift-depth REQ-004: at most MAX_JOBS running; finished jobs make room and expire after the TTL', async () => {
	let now = 1_000_000;
	const jobs = new AnalysisJobs<number>(() => now);
	const never = () => new Promise<number>(() => undefined);
	const running = Array.from({ length: MAX_JOBS - 1 }, () => jobs.start('t', never));
	const quick = jobs.start('t', async () => 1);
	await settle();
	await settle();
	assert.equal(jobs.get(quick.id)?.status, 'done');
	const extra = jobs.start('t', never);
	assert.equal(jobs.get(quick.id), null, 'the oldest finished job made room');
	assert.throws(() => jobs.start('t', never), JobLimitError);
	assert.equal(jobs.list().length, MAX_JOBS);
	assert.ok(running.length && extra.id);

	const later = new AnalysisJobs<number>(() => now);
	const old = later.start('t', async () => 2);
	await settle();
	await settle();
	now += JOB_TTL_MS + 1;
	assert.equal(later.get(old.id), null, 'expired');
});
