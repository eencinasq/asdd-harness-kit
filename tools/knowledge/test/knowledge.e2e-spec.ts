/**
 * knowledge end to end (formerly the knowledge-server cases of .harness/scripts/sync-knowledge.test.mjs):
 * fixture slice → index (vendored writer) → MCP queries, in-memory and over stdio. The fixture has no `.harness/scripts`.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module.ts';
import { KNOWLEDGE_OPTIONS, type KnowledgeOptions } from '../src/knowledge/knowledge.service.ts';

const MAIN = path.resolve(import.meta.dirname, '../src/main.ts');
const TOOLS = ['knowledge_patterns', 'knowledge_search', 'knowledge_slice', 'knowledge_status', 'knowledge_trace'];
const SLICE = 'test-slice';
const EMBEDDINGS = ['KNOWLEDGE_EMBEDDINGS_URL', 'KNOWLEDGE_EMBEDDINGS_MODEL', 'KNOWLEDGE_EMBEDDINGS_KEY'];

const { sqliteSupported } = (await import('../src/harness/knowledge-store-sqlite.mjs')) as {
	sqliteSupported(): boolean;
};
const { writeKnowledgeIndex } = (await import('../src/harness/sync-knowledge.mjs')) as {
	writeKnowledgeIndex(root: string, options?: { embed?: boolean }): Promise<unknown>;
};
const NO_SQLITE = !sqliteSupported() && 'node:sqlite requires Node >= 22.5';

// Empty strings keep the keys present, so env-loader never refills them from a developer's .env.
const clearEmbeddings = () => {
	for (const key of EMBEDDINGS) process.env[key] = '';
};
clearEmbeddings();

const write = (root: string, file: string, content: unknown) => {
	fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
};

/** One lite slice: two EARS requirements, two features (one depends on the other), one session. */
const fixture = (): string => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-'));
	write(
		root,
		`.harness/specs/${SLICE}/requirements.md`,
		`# Requirements: ${SLICE}

## EARS Requirements

### REQ-001 — Poker hand evaluation
**Universal:** The system shall evaluate poker hands deterministically.

### REQ-002 — Deposit crediting
**Event-driven:** When a deposit confirms on-chain, the system shall credit the player's balance.
`,
	);
	write(root, `.harness/features/${SLICE}.features.json`, {
		schema_version: '1.0',
		slice_id: SLICE,
		source_tasks: `.harness/specs/${SLICE}/tasks.md`,
		features: [
			{
				id: 'F-01',
				title: 'Hand evaluator',
				user_visible_behavior: 'Players see correct hand rankings',
				status: 'passing',
				priority: 1,
				verification: ['unit tests pass'],
				evidence: '42 tests green',
				req_ids: ['REQ-001'],
				scope_paths: ['src/poker/evaluator.ts'],
			},
			{
				id: 'F-02',
				title: 'Deposit watcher',
				user_visible_behavior: 'Balance updates after confirmation',
				status: 'in_progress',
				priority: 2,
				verification: ['e2e deposit flow'],
				req_ids: ['REQ-002'],
				depends_on: ['F-01'],
				scope_paths: ['src/wallet/deposits.ts'],
			},
		],
	});
	write(root, `.harness/state/slices/${SLICE}/manifest.json`, {
		schema_version: '3.0',
		slice_id: SLICE,
		phase: 'implementation',
		status: 'in_progress',
		mode: 'lite',
	});
	write(root, `.harness/state/slices/${SLICE}/sessions/001.json`, {
		session_id: 's-001',
		event_type: 'feature_started',
		phase: 'implementation',
		agent: 'asdd-implementation-agent',
		timestamp: '2026-10-12T00:00:00Z',
		feature_id: 'F-02',
		scope_paths: ['src/wallet/deposits.ts'],
		summary: 'Started deposit watcher; on-chain confirmations arrive via webhook',
	});
	return root;
};

/** Build the index with the vendored writer (what `asdd knowledge sync` runs). */
const sync = async (root: string, options: { embed?: boolean; env?: Record<string, string> } = {}) => {
	const saved = EMBEDDINGS.map((key) => [key, process.env[key]] as const);
	Object.assign(process.env, options.env);
	try {
		await writeKnowledgeIndex(root, { embed: options.embed ?? false });
	} finally {
		for (const [key, value] of saved) process.env[key] = value;
	}
};

/** Fake OpenAI-compatible endpoint: bag-of-words hashed into 16 dims. */
const fakeVector = (text: string): number[] => {
	const v = new Array<number>(16).fill(0);
	for (const w of text.toLowerCase().split(/\W+/)) {
		if (w) v[[...w].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 16] += 1;
	}
	return v;
};

const withEmbeddings = async <T>(run: (env: Record<string, string>) => Promise<T>): Promise<T> => {
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (d) => {
			body += d;
		});
		req.on('end', () => {
			const { input } = JSON.parse(body) as { input: string[] };
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ data: input.map((t, index) => ({ index, embedding: fakeVector(t) })) }));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const env = {
		KNOWLEDGE_EMBEDDINGS_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/embeddings`,
		KNOWLEDGE_EMBEDDINGS_MODEL: 'fake',
	};
	try {
		return await run(env);
	} finally {
		server.close();
	}
};

type Call = { isError: boolean; payload: Record<string, any> };

const call = async (client: Client, name: string, args: Record<string, unknown> = {}): Promise<Call> => {
	const result = await client.callTool({ name, arguments: args });
	const text = (result.content as Array<{ type: string; text?: string }>)[0];
	let payload: Record<string, any>;
	try {
		payload = JSON.parse(text?.text ?? '');
	} catch {
		payload = { error: text?.text };
	}
	return { isError: result.isError === true, payload };
};

/** Capture what the server reports on stderr while `run` executes. */
const captureStderr = async <T>(run: () => Promise<T>): Promise<{ value: T; stderr: string }> => {
	const original = process.stderr.write.bind(process.stderr);
	let stderr = '';
	process.stderr.write = ((chunk: string | Uint8Array) => {
		stderr += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		return { value: await run(), stderr };
	} finally {
		process.stderr.write = original;
	}
};

describe('knowledge (in-memory)', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let root: string;
	const cwd = process.cwd();

	before(async () => {
		root = fixture();
		process.chdir(root);
		const options: KnowledgeOptions = { root };
		moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(KNOWLEDGE_OPTIONS)
			.useValue(options)
			.compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	afterEach(clearEmbeddings);

	after(async () => {
		await client?.close();
		await moduleRef?.close();
		process.chdir(cwd);
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('lists the knowledge tools', async () => {
		const { tools } = await client.listTools();
		assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
		for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
	});

	test('without an index, index tools are errors that name the sync command', async () => {
		for (const [name, args] of [
			['knowledge_status', {}],
			['knowledge_search', { query: 'deposit' }],
			['knowledge_trace', { id: `slice:${SLICE}` }],
			['knowledge_slice', { slice_id: SLICE }],
		] as const) {
			const { isError, payload } = await call(client, name, args);
			assert.equal(isError, true, name);
			assert.match(payload['error'], /asdd knowledge sync/, name);
		}
	});

	test('knowledge_patterns needs no index', async () => {
		const { isError, payload } = await call(client, 'knowledge_patterns');
		assert.equal(isError, false);
		assert.ok(Array.isArray(payload['patterns']));
		assert.ok('failure_signatures' in payload);
		assert.equal((await call(client, 'knowledge_patterns', { status: 'open' })).isError, false);
	});

	test('rejects invalid arguments', async () => {
		assert.equal((await call(client, 'knowledge_search', { query: ' ' })).isError, true);
		assert.equal((await call(client, 'knowledge_trace', {})).isError, true);
		assert.equal((await call(client, 'knowledge_slice', { slice_id: '' })).isError, true);
		assert.equal((await call(client, 'knowledge_patterns', { status: 'nope' })).isError, true);
	});

	test('answers status, search, trace, slice (lexical)', async () => {
		await sync(root);

		const status = await call(client, 'knowledge_status');
		assert.equal(status.isError, false);
		assert.ok(status.payload['chunks'] > 0);
		assert.equal(status.payload['search_mode'], 'lexical');
		assert.ok(['jsonl', 'sqlite'].includes(status.payload['backend']));
		assert.deepEqual(status.payload['warnings'], []);

		const search = (await call(client, 'knowledge_search', { query: 'deposit balance confirms' })).payload;
		assert.equal(search['search_mode'], 'lexical');
		assert.ok(search['results'].length > 0);
		assert.match(search['results'][0].text, /deposit/i);

		const trace = (await call(client, 'knowledge_trace', { id: `req:${SLICE}:REQ-001`, depth: 2 })).payload;
		assert.equal(trace['found'], true);
		assert.ok(trace['nodes'].some((n: { id: string }) => n.id === `feature:${SLICE}:F-01`));

		const bundle = (await call(client, 'knowledge_slice', { slice_id: SLICE })).payload;
		assert.equal(bundle['slice'].slice_id, SLICE);
		assert.equal(bundle['requirements'].length, 2);
		assert.equal(bundle['features'].length, 2);
		assert.equal(bundle['sessions'], 1);
	});

	test('REQ-004: semantic search when the index has vectors', { skip: NO_SQLITE }, async () => {
		await withEmbeddings(async (env) => {
			await sync(root, { embed: true, env });
			Object.assign(process.env, env);

			const status = (await call(client, 'knowledge_status')).payload;
			assert.equal(status['backend'], 'sqlite');
			assert.equal(status['embedded_chunks'], status['chunks']);
			assert.equal(status['search_mode'], 'semantic');
			assert.deepEqual(status['warnings'], []);

			const query = 'deposit confirms balance credit';
			const search = (await call(client, 'knowledge_search', { query, k: 2 })).payload;
			assert.equal(search['search_mode'], 'semantic-cosine');
			assert.deepEqual(search['warnings'], []);
			assert.equal(search['results'].length, 2);
			for (const r of search['results']) assert.ok(typeof r.score === 'number' && r.embedding === undefined);

			// A slice filter searches only that slice.
			const scoped = (await call(client, 'knowledge_search', { query, k: 2, slice_id: SLICE })).payload;
			assert.equal(scoped['search_mode'], 'semantic-cosine');
			assert.equal(scoped['results'].length, 2);
			for (const r of scoped['results']) assert.equal(r.slice_id, SLICE);
		});
	});

	test('REQ-003: lexical fallback and a stale sqlite index are reported, not hidden', { skip: NO_SQLITE }, async () => {
		await withEmbeddings((env) => sync(root, { embed: true, env }));

		// Vectors in the index, but no embeddings endpoint configured.
		const status = (await call(client, 'knowledge_status')).payload;
		assert.equal(status['search_mode'], 'lexical');
		assert.match(status['warnings'].join('\n'), /KNOWLEDGE_EMBEDDINGS_URL\/MODEL are not set/);
		const { value: search, stderr } = await captureStderr(() =>
			call(client, 'knowledge_search', { query: 'deposit balance', k: 2 }),
		);
		assert.equal(search.payload['search_mode'], 'lexical');
		assert.match(search.payload['warnings'].join('\n'), /fell back to lexical/);
		assert.match(stderr, /fell back to lexical/);

		// meta.json newer than knowledge.db → JSONL served, with the reason.
		const metaPath = path.join(root, '.harness/knowledge/meta.json');
		const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
		fs.writeFileSync(metaPath, JSON.stringify({ ...meta, generated_at: '2099-02-02T00:00:00Z' }));
		const stale = (await call(client, 'knowledge_status')).payload;
		assert.equal(stale['backend'], 'jsonl');
		assert.match(stale['warnings'].join('\n'), /serving JSONL: knowledge.db is stale/);
	});
});

describe('knowledge (stdio transport)', () => {
	test('chdirs to HARNESS_ROOT and keeps stdout for the protocol', async () => {
		const root = fixture();
		await sync(root);
		const client = new Client({ name: 'e2e', version: '0' });
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ['--import', 'tsx', MAIN, '--stdio'],
				cwd: path.dirname(MAIN),
				env: {
					...(process.env as Record<string, string>),
					HARNESS_ROOT: root,
					TSX_TSCONFIG_PATH: path.resolve(MAIN, '../../tsconfig.json'),
				},
				stderr: 'ignore',
			}),
		);
		try {
			assert.equal(client.getServerVersion()?.name, 'knowledge');
			const { tools } = await client.listTools();
			assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
			const bundle = await call(client, 'knowledge_slice', { slice_id: SLICE });
			assert.equal(bundle.isError, false);
			assert.equal(bundle.payload['features'].length, 2);
		} finally {
			await client.close();
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
