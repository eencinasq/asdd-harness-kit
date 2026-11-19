import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CommandFailedError, type ProcessRunner } from '../../common/process/process-runner.service.ts';
import { GithubService, isDiffTooLarge } from './github.service.ts';

type Call = { command: string; args: readonly string[] };

const TOO_LARGE =
	'could not find pull request diff: HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000)\nPullRequest.diff too_large';

/** A ProcessRunner fake: `gh pr diff` answers with `ghResult`; git commands succeed with `gitOut`. */
function fakeRunner(ghResult: { code: number; stdout: string; stderr: string }, gitOut = 'diff --git a/x b/x\n') {
	const calls: Call[] = [];
	const run = async (command: string, args: readonly string[]) => {
		calls.push({ command, args });
		if (command === 'gh') return ghResult;
		return { code: 0, stdout: gitOut, stderr: '' };
	};
	const runner = {
		run,
		runOrThrow: async (command: string, args: readonly string[]) => {
			const result = await run(command, args);
			if (result.code !== 0) throw new CommandFailedError(command, args, result);
			return result.stdout;
		},
	} as unknown as ProcessRunner;
	return { runner, calls };
}

test('isDiffTooLarge matches only the GitHub line-limit refusal', () => {
	assert.equal(isDiffTooLarge(new Error(TOO_LARGE)), true);
	assert.equal(isDiffTooLarge(new Error('HTTP 401: Bad credentials')), false);
	assert.equal(isDiffTooLarge('too_large'), false);
});

test('fetchPrDiff returns the gh diff when GitHub serves it', async () => {
	const { runner, calls } = fakeRunner({ code: 0, stdout: 'gh diff', stderr: '' });
	const diff = await new GithubService(runner).fetchPrDiff(10, '/repo', {
		baseSha: 'b'.repeat(40),
		headSha: 'h'.repeat(40),
	});
	assert.equal(diff, 'gh diff');
	assert.deepEqual(
		calls.map((c) => c.command),
		['gh'],
	);
});

test('fetchPrDiff falls back to a local three-dot git diff when the diff is too large', async () => {
	const base = 'b'.repeat(40);
	const head = 'h'.repeat(40);
	const { runner, calls } = fakeRunner({ code: 1, stdout: '', stderr: TOO_LARGE }, 'local diff');
	const diff = await new GithubService(runner).fetchPrDiff(10, '/repo', { baseSha: base, headSha: head });
	assert.equal(diff, 'local diff');
	const gitDiff = calls.find((c) => c.command === 'git' && c.args[0] === 'diff');
	assert.ok(gitDiff, 'runs git diff');
	assert.equal(gitDiff.args.at(-1), `${base}...${head}`);
	for (const flag of ['--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']) {
		assert.ok(gitDiff.args.includes(flag), `passes ${flag}`);
	}
});

test('fetchPrDiff rethrows other gh failures and too-large without a local fallback', async () => {
	const auth = fakeRunner({ code: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' });
	await assert.rejects(
		new GithubService(auth.runner).fetchPrDiff(10, '/repo', { baseSha: 'b', headSha: 'h' }),
		/Bad credentials/,
	);
	const large = fakeRunner({ code: 1, stdout: '', stderr: TOO_LARGE });
	await assert.rejects(new GithubService(large.runner).fetchPrDiff(10, '/repo'), /too_large/);
});
