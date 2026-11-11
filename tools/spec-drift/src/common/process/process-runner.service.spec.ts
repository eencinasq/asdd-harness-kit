import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema.ts';
import { mcpRequestContext } from '../mcp/mcp-request-context.ts';
import { CommandAbortedError, CommandFailedError, ProcessRunner } from './process-runner.service.ts';

const config = { get: () => 5 } as unknown as ConfigService<Env, true>;
const runner = new ProcessRunner(config);
const node = process.execPath;

describe('ProcessRunner', () => {
	test('captures stdout and passes stdin', async () => {
		const out = await runner.runOrThrow(node, ['-e', 'process.stdin.pipe(process.stdout)'], {
			cwd: process.cwd(),
			input: 'hello',
		});
		assert.equal(out, 'hello');
	});

	test('rejects non-zero exits with stderr in the message', async () => {
		await assert.rejects(
			runner.runOrThrow(node, ['-e', 'console.error("nope"); process.exit(3)'], { cwd: process.cwd() }),
			(error: unknown) => error instanceof CommandFailedError && /exit 3\): nope/.test(error.message),
		);
	});

	test('kills commands that exceed the timeout', async () => {
		const started = Date.now();
		await assert.rejects(
			runner.run(node, ['-e', 'setTimeout(() => {}, 60_000)'], { cwd: process.cwd(), timeoutMs: 200 }),
			(error: unknown) => error instanceof CommandAbortedError && /timed out/.test(error.message),
		);
		assert.ok(Date.now() - started < 5_000);
	});

	test('kills commands when the MCP call is cancelled', async () => {
		const controller = new AbortController();
		const run = mcpRequestContext.run({ signal: controller.signal, reportProgress: async () => undefined }, () =>
			runner.run(node, ['-e', 'setTimeout(() => {}, 60_000)'], { cwd: process.cwd() }),
		);
		setTimeout(() => controller.abort(), 100);
		await assert.rejects(
			run,
			(error: unknown) => error instanceof CommandAbortedError && /cancelled/.test(error.message),
		);
	});

	test('runs git/gh non-interactively', async () => {
		const out = await runner.runOrThrow(
			node,
			[
				'-e',
				'console.log([process.env.GIT_TERMINAL_PROMPT, process.env.GH_PROMPT_DISABLED, process.env.GITHUB_TOKEN ?? "", process.env.GH_TOKEN ?? ""].join(","))',
			],
			{ cwd: process.cwd() },
		);
		assert.equal(out.trim(), '0,1,,');
	});
});
