/**
 * spec-drift-adoption REQ-003 end to end: the stdio server started with SPEC_DRIFT_TOOLSETS lists only those toolsets'
 * tools, prompts and resources; an unknown name stops it with the valid set.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN = path.join(ROOT, 'src/main.ts');

const listWith = async (toolsets: string) => {
	const client = new Client({ name: 'e2e', version: '0' });
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: ['--import', 'tsx', MAIN, '--stdio'],
			cwd: ROOT,
			env: { ...(process.env as Record<string, string>), SPEC_DRIFT_TOOLSETS: toolsets },
			stderr: 'ignore',
		}),
	);
	try {
		const tools = (await client.listTools()).tools.map((t) => t.name);
		const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
		const resources = (await client.listResources()).resources.map((r) => r.uri);
		return { tools, prompts, resources };
	} finally {
		await client.close();
	}
};

test('spec-drift-adoption REQ-003: with "review", only the PR review tools, prompts and view load', async () => {
	const { tools, prompts, resources } = await listWith('review');
	assert.ok(tools.length > 0);
	assert.ok(
		tools.every((t) => t.startsWith('pr_review_')),
		tools.join(', '),
	);
	assert.deepEqual(prompts, ['review-pr']);
	assert.ok(
		resources.every((uri) => !uri.startsWith('spec://') && !uri.includes('audit-dashboard')),
		resources.join(', '),
	);
});

test('spec-drift-adoption REQ-003: "analysis,audit" loads both and no review tool', async () => {
	const { tools, prompts } = await listWith('analysis,audit');
	assert.ok(tools.includes('analyze_spec_drift') && tools.includes('drift_trend') && tools.includes('audit_diff'));
	assert.ok(!tools.some((t) => t.startsWith('pr_review_')));
	assert.ok(prompts.includes('generate-architecture-rules') && prompts.includes('pr-review'), prompts.join(', '));
	assert.ok(!prompts.includes('review-pr'));
});

test('spec-drift-adoption REQ-003: an unknown toolset stops the server and names the valid ones', () => {
	const r = spawnSync(process.execPath, ['--import', 'tsx', MAIN, '--stdio'], {
		cwd: ROOT,
		env: { ...process.env, SPEC_DRIFT_TOOLSETS: 'reviews' },
		input: '',
		encoding: 'utf8',
		timeout: 60_000,
	});
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /unknown toolset "reviews"\. Use: analysis, review, audit\./);
	assert.equal(r.stdout, '', 'stdout stays clean for the protocol');
});
