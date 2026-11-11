/**
 * jev-gate end to end (formerly .agents/mcp/jev-gate-server.test.mjs): in-memory and stdio, against a throwaway
 * harness root with no `.harness/scripts`: the server runs on its vendored copies. No test calls System One: JEV_API_KEY is kept empty.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { JEV_OPTIONS, type JevOptions } from '../src/jev/jev.service.ts';

const MAIN = path.resolve(import.meta.dirname, '../src/main.ts');
const TOOLS = ['check_command_safety', 'jev_ears_gate', 'jev_scope_choice', 'jev_shape_up_gates', 'jev_status'];

// Empty string keeps the key present, so env-loader never refills it from a developer's .env.
process.env['JEV_API_KEY'] = '';

/** A harness root with the jev capability enabled (the jev module seeds it) and no key. */
const harnessRoot = (): string => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-gate-'));
	fs.mkdirSync(path.join(root, '.harness/config'), { recursive: true });
	fs.writeFileSync(
		path.join(root, '.harness/config/project.json'),
		`${JSON.stringify({ modules: { jev: true }, capabilities: { jev: { enabled: true, required: false, apiKey: '' } } }, null, 2)}\n`,
	);
	return root;
};

type Call = { isError: boolean; payload: Record<string, any> };

const call = async (client: Client, name: string, args: Record<string, unknown> = {}): Promise<Call> => {
	const result = await client.callTool({ name, arguments: args });
	const text = (result.content as Array<{ type: string; text?: string }>)[0];
	assert.equal(text?.type, 'text');
	let payload: Record<string, any>;
	try {
		payload = JSON.parse(text?.text ?? '');
	} catch {
		payload = { error: text?.text };
	}
	return { isError: result.isError === true, payload };
};

describe('jev-gate (in-memory)', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let root: string;
	const cwd = process.cwd();

	before(async () => {
		root = harnessRoot();
		// The harness's jev scripts read project.json from the working directory (main.ts chdirs to HARNESS_ROOT).
		process.chdir(root);
		const options: JevOptions = { root };
		moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(JEV_OPTIONS)
			.useValue(options)
			.compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
		process.chdir(cwd);
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('lists the skill gates and the deprecated command check', async () => {
		const { tools } = await client.listTools();
		assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
		const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
		assert.match(byName['check_command_safety']?.description ?? '', /Deprecated/);
		assert.equal(byName['jev_status']?.annotations?.openWorldHint, true, 'jev_* call System One');
		assert.equal(byName['check_command_safety']?.annotations?.openWorldHint, false);
	});

	test('safe command is allowed by pattern whitelist (no Jev call)', async () => {
		const { isError, payload } = await call(client, 'check_command_safety', { command: 'ls -la' });
		assert.equal(isError, false);
		assert.equal(payload['allowed'], true);
		assert.equal(payload['method'], 'pattern-whitelist');
	});

	test('dangerous command is denied by pattern (no Jev call)', async () => {
		const { isError, payload } = await call(client, 'check_command_safety', { command: 'rm -rf /tmp/anything' });
		assert.equal(isError, false);
		assert.equal(payload['allowed'], false);
		assert.equal(payload['method'], 'pattern-deny');
	});

	test('override allows a dangerous command without calling Jev', async () => {
		const { payload } = await call(client, 'check_command_safety', { command: 'rm -rf /tmp/anything', override: true });
		assert.equal(payload['allowed'], true);
		assert.equal(payload['method'], 'override');
	});

	test('jev_status fails closed without JEV_API_KEY', async () => {
		const { isError, payload } = await call(client, 'jev_status');
		assert.equal(isError, true);
		assert.equal(payload['unavailable'], true);
		assert.match(payload['error'], /JEV_API_KEY/);
		assert.ok(payload['thresholds']);
	});

	test('every jev_* gate fails closed without JEV_API_KEY', async () => {
		for (const [name, args] of [
			['jev_shape_up_gates', { pitch: { problem: 'x' }, appetite: '2 weeks' }],
			['jev_shape_up_gates', { pitch: 'a pitch as text' }],
			['jev_ears_gate', { requirement: 'The system shall log every login.' }],
			['jev_scope_choice', { scope: 'export to CSV' }],
		] as const) {
			const { isError, payload } = await call(client, name, args);
			assert.equal(isError, true, name);
			assert.equal(payload['unavailable'], true, name);
		}
	});

	test('rejects invalid arguments', async () => {
		assert.equal((await call(client, 'check_command_safety', { command: ' ' })).isError, true);
		assert.equal((await call(client, 'jev_ears_gate', { requirement: '' })).isError, true);
		assert.equal((await call(client, 'jev_scope_choice', {})).isError, true);
		assert.equal((await call(client, 'jev_shape_up_gates', { pitch: 3 })).isError, true);
	});

	test('unknown tools fail', async () => {
		const result = await client.callTool({ name: 'nope', arguments: {} }).catch((error: unknown) => error);
		assert.ok(result instanceof Error || (result as { isError?: boolean }).isError === true);
	});
});

describe('jev-gate (stdio transport)', () => {
	test('chdirs to HARNESS_ROOT, needs no harness scripts, keeps stdout for the protocol', async () => {
		const root = harnessRoot();
		const client = new Client({ name: 'e2e', version: '0' });
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ['--import', 'tsx', MAIN, '--stdio'],
				cwd: path.dirname(MAIN),
				env: {
					...(process.env as Record<string, string>),
					HARNESS_ROOT: root,
					JEV_API_KEY: '',
					TSX_TSCONFIG_PATH: path.resolve(MAIN, '../../tsconfig.json'),
				},
				stderr: 'ignore',
			}),
		);
		try {
			assert.equal(client.getServerVersion()?.name, 'jev-gate');
			const { tools } = await client.listTools();
			assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
			// project.json is read from HARNESS_ROOT: jev is enabled there, so the missing key is the reason.
			const status = await call(client, 'jev_status');
			assert.equal(status.isError, true);
			assert.match(status.payload['error'], /JEV_API_KEY/);
		} finally {
			await client.close();
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
