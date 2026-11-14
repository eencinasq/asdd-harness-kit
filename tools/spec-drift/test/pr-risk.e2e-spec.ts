/**
 * spec-drift-depth REQ-002 end to end: pr_review_start ranks the PR's changed files by risk from the base branch's git
 * history, the repository's features, this PR's architecture findings, and the latest audit report; the prompt names
 * the files to read first; pr_review_status returns the same ranking.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import type { PrReviewView } from '../src/pr-review/pr-review.types.ts';
import {
	createReviewedRepo,
	FAKE_GH_BIN,
	hasSemgrep,
	PR_NUMBER,
	type ReviewedRepo,
	tmpDir,
} from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');

const FEATURES = {
	slice_id: 'parsing',
	features: [
		{ id: 'TASK-001', scope_paths: ['src/util.py'], req_ids: ['REQ-001', 'REQ-002'] },
		{ id: 'TASK-002', scope_paths: ['docs'], req_ids: ['REQ-003'] },
	],
};
const AUDIT = {
	generated_at: '2026-11-01T00:00:00.000Z',
	findings: [
		{ id: 'AUD-1', check: 'DRIFT-01', severity: 'fail', paths: ['src/util.py'], message: 'drift' },
		{ id: 'AUD-2', check: 'UNOWNED', severity: 'advisory', paths: ['src/app.ts'], message: 'unowned' },
	],
	hotspots: [{ path: 'src/util.py', score: 9 }],
};

describe('PR risk (fake gh, real git)', () => {
	let moduleRef: TestingModule;
	let client: Client;
	let sandbox: ReviewedRepo;
	const semgrep = hasSemgrep();

	const call = (name: string) => client.callTool({ name, arguments: { pr: PR_NUMBER, repoPath: sandbox.repo } });
	const view = async (name: string): Promise<{ view: PrReviewView; text: string }> => {
		const result = await call(name);
		assert.ok(!result.isError, `${name} failed: ${textOf(result)}`);
		return { view: result.structuredContent as unknown as PrReviewView, text: textOf(result) };
	};

	before(async () => {
		sandbox = createReviewedRepo({
			baseFiles: {
				'.harness/features/parsing.features.json': `${JSON.stringify(FEATURES, null, 2)}\n`,
				'.harness/audits/2026-11-01T00-00-00-000Z.json': `${JSON.stringify(AUDIT, null, 2)}\n`,
			},
		});
		Object.assign(process.env, {
			PATH: `${FAKE_GH_BIN}${path.delimiter}${process.env['PATH']}`,
			FAKE_GH_STATE: sandbox.ghState,
			PR_REVIEW_ROOT: tmpDir('mcp-risk-artifacts'),
		});
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('spec-drift-depth REQ-002: start ranks the changed files and the prompt says what to read first', async () => {
		const { view: start, text } = await view('pr_review_start');
		const risk = start.risk;
		assert.ok(risk, 'the start result has the ranking');
		assert.deepEqual(risk.unavailable, semgrep ? [] : ['architecture']);
		const util = risk.files.find((f) => f.path === 'src/util.py');
		assert.ok(util);
		// Base history: 1 commit; 2 requirement links (TASK-001); 1 audit finding (UNOWNED does not count).
		assert.deepEqual(
			{ churn: util.churn, reqLinks: util.reqLinks, hotspot: util.hotspot, level: util.level },
			{ churn: 1, reqLinks: 2, hotspot: 1, level: 'high' },
		);
		assert.ok(util.findings >= 1);
		assert.equal(util.score, util.churn + 2 * util.reqLinks + 5 * util.findings);
		assert.ok(util.reasons.includes('2 requirement links (parsing/TASK-001)'));
		assert.ok(util.reasons.includes('audit hotspot #1'));
		const lock = risk.files.find((f) => f.path === 'package-lock.json');
		assert.equal(lock?.score, 1, 'a file with only churn is low');
		assert.equal(lock?.level, 'low');
		const scores = risk.files.map((f) => f.score);
		assert.deepEqual(
			scores,
			[...scores].sort((a, b) => b - a),
			'ranked by score',
		);
		assert.match(start.prompt ?? '', /## Read first \(risk\)/);
		const first = risk.files[0];
		assert.ok(first);
		assert.match(start.prompt ?? '', new RegExp(`- \`${first.path.replace('.', '\\.')}\` — ${first.level}`));
		assert.match(text, /Read first \(risk\): /);
	});

	test('spec-drift-depth REQ-002: status returns the same ranking', async () => {
		const { view: start } = await view('pr_review_start');
		const { view: status, text } = await view('pr_review_status');
		assert.deepEqual(status.risk, start.risk);
		assert.match(text, /read first \(risk\): /);
	});
});
