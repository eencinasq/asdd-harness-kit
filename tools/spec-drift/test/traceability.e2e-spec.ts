/**
 * spec-drift-depth REQ-001 end to end: traceability_matrix over a throwaway git repo with a knowledge index, read-only,
 * with a declared output schema; and "no data" without an index.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { AUDIT_OPTIONS } from '../src/audit/audit.service.ts';
import { TraceabilityOutput } from '../src/audit/audit-insight.output.ts';

type Json = Record<string, any>;

const write = (root: string, rel: string, content: string | object): void => {
	mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	writeFileSync(path.join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};
const jsonl = (rows: object[]): string => rows.map((r) => JSON.stringify(r)).join('\n');
const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args],
		{
			cwd,
			encoding: 'utf8',
		},
	);
const status = (cwd: string): string => git(cwd, 'status', '--porcelain', '--untracked-files=all');

const start = async (root: string): Promise<{ moduleRef: TestingModule; client: Client }> => {
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(AUDIT_OPTIONS)
		.useValue({ root, semgrepBin: path.join(root, 'no-semgrep'), gateTimeoutMs: 10_000 })
		.compile();
	await moduleRef.init();
	return { moduleRef, client: await connectMcpClient(moduleRef) };
};

let root: string;
let bare: string;
let server: { moduleRef: TestingModule; client: Client };
let bareServer: { moduleRef: TestingModule; client: Client };

const call = async (client: Client, args: Json = {}) => {
	const r = await client.callTool({ name: 'traceability_matrix', arguments: args });
	return { isError: r.isError === true, structured: (r.structuredContent ?? {}) as Json };
};

before(async () => {
	root = mkdtempSync(path.join(os.tmpdir(), 'sd-trace-'));
	git(root, 'init', '-q', '-b', 'main');
	write(root, 'src/login/login.ts', 'export const login = () => true;\n');
	write(root, 'src/login/login.spec.ts', 'test("login", () => {});\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'feat: login (#12)');
	write(root, 'src/logout.ts', 'export const logout = () => true;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'Merge pull request #15 from org/logout');
	write(root, '.harness/state/registry.json', { slices: [{ slice_id: 'auth' }, { slice_id: 'audit' }] });
	write(root, '.harness/knowledge/meta.json', { generated_at: '2026-11-13T00:00:00.000Z' });
	write(
		root,
		'.harness/knowledge/nodes.jsonl',
		jsonl([
			{ id: 'req:auth:REQ-001', type: 'requirement', slice_id: 'auth', req_id: 'REQ-001', title: 'Login' },
			{ id: 'req:auth:REQ-002', type: 'requirement', slice_id: 'auth', req_id: 'REQ-002', title: 'Logout' },
			{ id: 'req:audit:REQ-001', type: 'requirement', slice_id: 'audit', req_id: 'REQ-001', title: 'Audit log' },
			{ id: 'feature:auth:TASK-001', type: 'feature', slice_id: 'auth', feature_id: 'TASK-001', status: 'passing' },
			{ id: 'feature:auth:TASK-002', type: 'feature', slice_id: 'auth', feature_id: 'TASK-002', status: 'in_progress' },
		]),
	);
	write(
		root,
		'.harness/knowledge/edges.jsonl',
		jsonl([
			{ from: 'feature:auth:TASK-001', to: 'req:auth:REQ-001', rel: 'IMPLEMENTS_REQ' },
			{ from: 'feature:auth:TASK-001', to: 'file:src/login', rel: 'OWNS' },
			{ from: 'feature:auth:TASK-002', to: 'req:auth:REQ-002', rel: 'IMPLEMENTS_REQ' },
			{ from: 'feature:auth:TASK-002', to: 'file:src/logout.ts', rel: 'OWNS' },
		]),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'chore: harness data');
	server = await start(root);

	bare = mkdtempSync(path.join(os.tmpdir(), 'sd-trace-bare-'));
	write(bare, '.harness/state/registry.json', { slices: [{ slice_id: 'auth' }] });
	bareServer = await start(bare);
});

after(async () => {
	for (const s of [server, bareServer]) {
		await s?.client.close();
		await s?.moduleRef.close();
	}
	rmSync(root, { recursive: true, force: true });
	rmSync(bare, { recursive: true, force: true });
});

test('spec-drift-depth REQ-001: the matrix joins requirements, features, tests and PRs, and writes nothing', async () => {
	const { tools } = await server.client.listTools();
	const tool = tools.find((t) => t.name === 'traceability_matrix');
	assert.equal(tool?.annotations?.readOnlyHint, true);
	assert.equal(tool?.outputSchema?.type, 'object');

	const { isError, structured } = await call(server.client);
	assert.equal(isError, false, JSON.stringify(structured));
	assert.ok(TraceabilityOutput.safeParse(structured).success);
	const [login, logout, audit] = structured['matrix'];
	assert.deepEqual(
		{ req: login['req_id'], tests: login['tests'], prs: login['prs'], gaps: login['gaps'] },
		{ req: 'REQ-001', tests: ['src/login/login.spec.ts'], prs: [12], gaps: [] },
	);
	assert.deepEqual(login['files'], ['src/login/login.spec.ts', 'src/login/login.ts'], 'the owned folder is expanded');
	assert.deepEqual(logout['prs'], [15]);
	assert.deepEqual(logout['gaps'], ['no-test', 'not-passing']);
	assert.equal(audit['slice'], 'audit');
	assert.deepEqual(audit['gaps'], ['no-feature', 'no-test']);
	assert.deepEqual(structured['totals'], { requirements: 3, with_feature: 2, tested: 1, passing: 1, with_gaps: 2 });
	assert.match(structured['markdown'], /\| auth \| REQ-001 \| Login \| TASK-001 \(passing\) \|/);
	assert.equal(structured['index_generated_at'], '2026-11-13T00:00:00.000Z');
	assert.equal(status(root), '', 'no file changed');
});

test('spec-drift-depth REQ-001: one slice, gaps only, and an unknown slice', async () => {
	let { structured } = await call(server.client, { slice_id: 'auth', gaps_only: true });
	assert.deepEqual(
		structured['matrix'].map((r: Json) => r['req_id']),
		['REQ-002'],
	);
	assert.equal(structured['totals']['requirements'], 2, 'totals cover the whole slice');
	const unknown = await call(server.client, { slice_id: 'nope' });
	assert.equal(unknown.isError, true);
	assert.match(unknown.structured['error'], /Unknown slice "nope". Slices: auth, audit/);
	({ structured } = await call(server.client, { slice_id: 'audit' }));
	assert.equal(structured['matrix'][0]['req_id'], 'REQ-001');
});

test('spec-drift-depth REQ-001: without a knowledge index the matrix is "no data" naming asdd knowledge sync', async () => {
	const { isError, structured } = await call(bareServer.client);
	assert.equal(isError, false);
	assert.ok(TraceabilityOutput.safeParse(structured).success);
	assert.deepEqual(structured['matrix'], []);
	assert.match(structured['no_data']['next'], /asdd knowledge sync/);
});
