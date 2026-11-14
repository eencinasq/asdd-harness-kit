/**
 * spec-drift-depth REQ-004 end to end: analysis_start returns a job id at once, analysis_job returns the scan result the
 * foreground tool returns; unknown ids are errors.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { createSemgrepSpecRepo, hasSemgrep, tmpDir } from './fixtures/sandbox.ts';

type Json = Record<string, any>;

describe('background analysis jobs', { skip: !hasSemgrep() && 'semgrep not installed' }, () => {
	let moduleRef: TestingModule;
	let client: Client;
	const call = async (name: string, args: Json = {}) => {
		const r = await client.callTool({ name, arguments: args });
		return { isError: r.isError === true, structured: (r.structuredContent ?? {}) as Json, raw: r };
	};

	before(async () => {
		Object.assign(process.env, { ANALYSIS_REPO_ROOT: createSemgrepSpecRepo(), PR_REVIEW_ROOT: tmpDir('sd-jobs') });
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('spec-drift-depth REQ-004: analysis_start returns a job at once; analysis_job returns the foreground result', async () => {
		const { tools } = await client.listTools();
		for (const name of ['analysis_start', 'analysis_job']) {
			const tool = tools.find((t) => t.name === name);
			assert.equal(tool?.annotations?.readOnlyHint, true, name);
			assert.equal(tool?.outputSchema?.type, 'object', name);
		}
		const started = await call('analysis_start', { mode: 'spec-drift' });
		assert.equal(started.isError, false, JSON.stringify(started.structured));
		const job = started.structured['job'];
		assert.equal(job['tool'], 'analyze_spec_drift');
		assert.ok(['running', 'done'].includes(job['status']));
		assert.match(JSON.stringify(started.raw.content), /analysis_job/);

		let polled: Json = {};
		for (let i = 0; i < 300; i += 1) {
			polled = (await call('analysis_job', { id: job['id'] })).structured;
			if (polled['job']['status'] !== 'running') break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.equal(polled['job']['status'], 'done', JSON.stringify(polled['job']));
		assert.ok(polled['job']['progress'], 'the last progress message is kept');
		const foreground = (await call('analyze_spec_drift', { mode: 'spec-drift' })).structured;
		assert.equal(polled['result']['findingCount'], foreground['findingCount']);
		assert.deepEqual(polled['result']['byRule'], foreground['byRule']);

		const listed = (await call('analysis_job')).structured;
		assert.ok(listed['jobs'].some((j: Json) => j['id'] === job['id']));
	});

	test('spec-drift-depth REQ-004: an unknown job id is an error', async () => {
		const r = await call('analysis_job', { id: '00000000-0000-0000-0000-000000000000' });
		assert.equal(r.isError, true);
		assert.match(JSON.stringify(r.raw.content), /No analysis job/);
	});
});
