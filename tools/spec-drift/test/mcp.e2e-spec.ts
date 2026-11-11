/**
 * End-to-end tests of the MCP server: in-memory (Nest testing module), stdio and Streamable HTTP.
 * Run `pnpm build` first — the UI resources read dist/*.html.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { createSemgrepSpecRepo } from './fixtures/sandbox.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN = path.join(ROOT, 'src/main.ts');
const UI = {
	semgrep: 'ui://spec-drift/dashboard.html',
	pr: 'ui://spec-drift/pr-review.html',
	audit: 'ui://spec-drift/audit-dashboard.html',
};
const APP_MIME = 'text/html;profile=mcp-app';
const EXPECTED_UI: Record<string, { uri: string; appOnly?: boolean }> = {
	analyze_architecture: { uri: UI.semgrep },
	analyze_standards: { uri: UI.semgrep },
	analyze_spec_drift: { uri: UI.semgrep },
	rescan: { uri: UI.semgrep, appOnly: true },
	pr_review_save_draft: { uri: UI.pr },
	pr_review_status: { uri: UI.pr },
	pr_review_architecture_rescan: { uri: UI.pr },
	pr_review_import_architecture: { uri: UI.pr },
	pr_review_publish: { uri: UI.pr },
	pr_review_ui_save: { uri: UI.pr, appOnly: true },
	pr_review_ui_reload: { uri: UI.pr, appOnly: true },
	pr_review_ui_publish: { uri: UI.pr, appOnly: true },
	pr_review_ui_requirements: { uri: UI.pr, appOnly: true },
	audit_diff: { uri: UI.audit },
	verify_architecture_rules: { uri: UI.audit },
	verify_spec_compliance: { uri: UI.audit },
	generate_ci_gate: { uri: UI.audit },
	audit_report: { uri: UI.audit },
	audit_finding: { uri: UI.audit },
};
const TEXT_ONLY = [
	'list_rule_packs',
	'pr_review_start',
	'pr_review_next_group',
	'pr_review_submit_findings',
	'pr_review_set_ticket',
	'pr_review_submit_requirements',
	'pr_review_verify_findings',
	'pr_review_read_file',
	'pr_review_search',
	'pr_review_metrics',
	'pr_review_cleanup',
];

const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string =>
	(result.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');

/** Contract every transport must satisfy. */
const assertContract = async (client: Client): Promise<void> => {
	const { tools } = await client.listTools();
	assert.equal(tools.length, 30, 'tool count');
	for (const [name, ui] of Object.entries(EXPECTED_UI)) {
		const meta = tools.find((t) => t.name === name)?._meta as Record<string, any> | undefined;
		assert.equal(meta?.ui?.resourceUri, ui.uri, `${name} ui.resourceUri`);
		assert.equal(meta?.['ui/resourceUri'], ui.uri, `${name} legacy ui/resourceUri`);
		assert.deepEqual(meta?.ui?.visibility, ui.appOnly ? ['app'] : undefined, `${name} visibility`);
	}
	for (const name of TEXT_ONLY) {
		const tool = tools.find((t) => t.name === name);
		assert.ok(tool, `missing ${name}`);
		assert.equal((tool._meta as any)?.ui, undefined, `${name} must not open UI`);
	}

	// Clients use annotations to decide what needs approval.
	const annotations = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
	assert.ok(
		Object.values(annotations).every((a) => Object.keys(a).length > 0),
		'every tool annotated',
	);
	assert.equal(annotations['analyze_spec_drift']?.readOnlyHint, true);
	assert.equal(annotations['pr_review_publish']?.destructiveHint, true);
	assert.equal(annotations['pr_review_publish']?.openWorldHint, true);

	const { prompts } = await client.listPrompts();
	assert.deepEqual(prompts.map((p) => p.name).sort(), [
		'architecture-review',
		'pr-review',
		'review-pr',
		'spec-alignment',
		'spec-drift-report',
	]);
	const review = await client.getPrompt({ name: 'review-pr', arguments: { pr: '825', repoPath: '/repo' } });
	const reviewContent = review.messages[0]?.content;
	assert.equal(reviewContent?.type, 'text');
	const reviewText = (reviewContent as { text: string }).text;
	assert.match(reviewText, /pr_review_start with \{ pr: 825, repoPath: "\/repo" \}/);
	assert.match(reviewText, /untrusted content/);

	const { resourceTemplates } = await client.listResourceTemplates();
	assert.deepEqual(
		resourceTemplates.map((t) => t.uriTemplate),
		['pr-review://{project}/{pr}/{file}'],
	);

	const { resources } = await client.listResources();
	assert.deepEqual(
		resources.map((r) => [r.uri, r.mimeType]).sort(),
		[
			[UI.semgrep, APP_MIME],
			[UI.pr, APP_MIME],
			[UI.audit, APP_MIME],
			['spec://manifest', 'application/json'],
			['spec://rules/architecture', 'text/markdown'],
			['spec://drift/latest-report', 'application/json'],
		].sort(),
	);
	for (const uri of Object.values(UI)) {
		const { contents } = await client.readResource({ uri });
		assert.equal(contents[0]?.mimeType, APP_MIME);
		assert.match((contents[0] as { text: string }).text, /<html/i, `${uri} is html`);
	}

	const packs = await client.callTool({ name: 'list_rule_packs', arguments: {} });
	assert.ok(!packs.isError);
	assert.ok(Array.isArray((packs.structuredContent as { packs: unknown[] }).packs));
};

describe('MCP server (in-memory)', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let repo: string;

	before(async () => {
		// A throwaway git repo + artifact root so PR-review tools never touch real state.
		repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-e2e-repo-'));
		execFileSync('git', ['init', '-q'], { cwd: repo });
		process.env['PR_REVIEW_ROOT'] = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-e2e-artifacts-'));
		// Never scan the developer's real checkout from tests.
		process.env['ANALYSIS_REPO_ROOT'] = createSemgrepSpecRepo();

		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('exposes the tool / resource contract', () => assertContract(client));

	test('analyze_spec_drift runs through the service', async () => {
		const result = await client.callTool({
			name: 'analyze_spec_drift',
			arguments: { packs: ['boundaries'], paths: ['src'] },
		});
		assert.ok(!result.isError, textOf(result));
		assert.equal(typeof (result.structuredContent as { findingCount: unknown }).findingCount, 'number');
	});

	test('rejects invalid input', async () => {
		const result = await client.callTool({ name: 'pr_review_status', arguments: { pr: -1 } });
		assert.equal(result.isError, true);
	});

	test('reports service errors with their message, not "Internal server error"', async () => {
		const result = await client.callTool({
			name: 'pr_review_import_architecture',
			arguments: { pr: 1, repoPath: repo },
		});
		assert.equal(result.isError, true);
		assert.match(textOf(result), /No scanned architecture findings/);
	});

	test('reports CLI failures with their message', async () => {
		const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-e2e-norepo-'));
		const result = await client.callTool({ name: 'pr_review_status', arguments: { pr: 1, repoPath: notARepo } });
		assert.equal(result.isError, true);
		assert.match(textOf(result), /git rev-parse --show-toplevel failed/);
	});
});

describe('MCP server (stdio transport)', () => {
	test('serves the contract over stdio', async () => {
		const client = new Client({ name: 'e2e', version: '0' });
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ['--import', 'tsx', MAIN, '--stdio'],
				cwd: ROOT,
				stderr: 'ignore',
			}),
		);
		try {
			await assertContract(client);
			// A failing call logs to stderr only; stdout (the protocol) stays clean and usable.
			const failed = await client.callTool({ name: 'pr_review_status', arguments: { pr: 1, repoPath: os.tmpdir() } });
			assert.equal(failed.isError, true);
			assert.match(textOf(failed), /git rev-parse/);
			const after = await client.callTool({ name: 'list_rule_packs', arguments: {} });
			assert.ok(!after.isError);
		} finally {
			await client.close();
		}
	});
});

describe('MCP server (HTTP transport)', () => {
	const port = 3099;
	const base = `http://localhost:${port}`;
	let server: ChildProcess;

	before(async () => {
		server = spawn(process.execPath, ['--import', 'tsx', MAIN], {
			cwd: ROOT,
			env: { ...process.env, PORT: String(port) },
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('HTTP server did not start')), 30_000);
			server.stderr?.on('data', (chunk: Buffer) => {
				if (chunk.toString().includes('listening on')) {
					clearTimeout(timer);
					resolve();
				}
			});
			server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
		});
	});

	after(() => {
		if (server && server.exitCode === null) server.kill();
	});

	test('serves the contract over Streamable HTTP', async () => {
		const client = new Client({ name: 'e2e', version: '0' });
		await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
		try {
			await assertContract(client);
			// Larger than Express' 100 KB default body limit.
			const big = await client.callTool({
				name: 'list_rule_packs',
				arguments: { padding: 'x'.repeat(500_000) },
			});
			assert.ok(!big.isError, 'large request body');
		} finally {
			await client.close();
		}
	});

	test('handles 50 concurrent tool calls (stateless server per request)', async () => {
		const clients = await Promise.all(
			Array.from({ length: 5 }, async () => {
				const c = new Client({ name: 'e2e-load', version: '0' });
				await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
				return c;
			}),
		);
		try {
			const results = await Promise.all(
				Array.from({ length: 50 }, (_, i) =>
					clients[i % clients.length]!.callTool({ name: 'list_rule_packs', arguments: {} }),
				),
			);
			assert.ok(results.every((r) => !r.isError && Array.isArray((r.structuredContent as { packs: unknown[] }).packs)));
		} finally {
			await Promise.all(clients.map((c) => c.close()));
		}
	});

	test('rejects malformed requests and keeps serving', async () => {
		const post = (body: string) =>
			fetch(`${base}/mcp`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
				body,
			});
		for (const body of ['{not json', '{"jsonrpc":"2.0","id":1}', '[]']) {
			const res = await post(body);
			assert.ok(res.status >= 400 && res.status < 500, `${body} → ${res.status}`);
		}
		const health = await fetch(`${base}/health`);
		assert.equal(health.status, 200);
	});

	test('GET /health', async () => {
		const res = await fetch(`${base}/health`);
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { status: 'ok', name: 'spec-drift', version: '1.0.0' });
	});

	const listTools = (headers: Record<string, string>) =>
		fetch(`${base}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

	test('rejects browser requests from other sites (tools act with your gh credentials)', async () => {
		assert.equal((await listTools({ origin: 'https://evil.example' })).status, 403);
		assert.equal((await listTools({ origin: 'null' })).status, 403);
	});

	test('accepts localhost origins and non-browser clients', async () => {
		assert.equal((await listTools({ origin: 'http://localhost:6274' })).status, 200);
		assert.equal((await listTools({})).status, 200);
	});

	test('rejects DNS-rebinding Host headers while bound to loopback', async () => {
		// fetch() drops a custom Host header, so use node:http.
		const statusFor = (host: string) =>
			new Promise<number>((resolve, reject) => {
				const req = http.request(
					{
						host: '127.0.0.1',
						port,
						path: '/mcp',
						method: 'POST',
						headers: { host, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
					},
					(res) => {
						res.resume();
						resolve(res.statusCode ?? 0);
					},
				);
				req.on('error', reject);
				req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
			});
		assert.equal(await statusFor(`attacker.example:${port}`), 403);
		assert.equal(await statusFor(`localhost:${port}`), 200);
	});

	// Last: stops the server. Nest's shutdown hooks close the app, then re-raise the signal.
	test('shuts down cleanly on SIGTERM', { timeout: 15_000 }, async () => {
		const exited = new Promise<NodeJS.Signals | number | null>((resolve) =>
			server.once('exit', (code, signal) => resolve(signal ?? code)),
		);
		server.kill('SIGTERM');
		assert.ok([0, 'SIGTERM'].includes((await exited) as never), 'exits on SIGTERM');
	});
});

const startHttpServer = (env: Record<string, string>) => {
	const child = spawn(process.execPath, ['--import', 'tsx', MAIN], {
		cwd: ROOT,
		env: { ...process.env, ...env },
		stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	const ready = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 30_000);
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
			if (stderr.includes('listening on')) {
				clearTimeout(timer);
				resolve();
			}
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			reject(Object.assign(new Error(`server exited ${code}`), { stderr }));
		});
	});
	return { child, ready };
};

describe('HTTP transport security', () => {
	test('refuses to listen off-loopback without MCP_API_KEY', async () => {
		const { ready } = startHttpServer({ PORT: '3097', HOST: '0.0.0.0', MCP_API_KEY: '' });
		await assert.rejects(ready, (error: { stderr?: string }) => /MCP_API_KEY/.test(error.stderr ?? ''));
	});

	test('requires the API key when MCP_API_KEY is set', async () => {
		const key = 'e2e-secret-key-0123456789';
		const { child, ready } = startHttpServer({ PORT: '3098', MCP_API_KEY: key });
		try {
			await ready;
			const url = 'http://localhost:3098/mcp';
			const post = (headers: Record<string, string>) =>
				fetch(url, {
					method: 'POST',
					headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
				});
			assert.equal((await post({})).status, 401);
			assert.equal((await post({ 'x-api-key': 'wrong-key-wrong-key-00' })).status, 401);
			assert.equal((await post({ 'x-api-key': key })).status, 200);
			assert.equal((await post({ authorization: `Bearer ${key}` })).status, 200);
			assert.equal((await fetch('http://localhost:3098/health')).status, 200, '/health stays public');

			const client = new Client({ name: 'e2e-key', version: '0' });
			await client.connect(
				new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { 'x-api-key': key } } }),
			);
			assert.equal((await client.listTools()).tools.length, 30);
			await client.close();
		} finally {
			child.kill();
		}
	});
});

describe('compiled build (dist/server, as shipped in the npm package)', {
	skip: !fs.existsSync(path.join(ROOT, 'dist/server/main.js')) && 'run pnpm build first',
}, () => {
	test('serves the contract with plain node from another directory', async () => {
		const client = new Client({ name: 'e2e-dist', version: '0' });
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: [path.join(ROOT, 'bin/spec-drift.mjs')],
				cwd: '/',
				stderr: 'ignore',
			}),
		);
		try {
			await assertContract(client);
		} finally {
			await client.close();
		}
	});
});
