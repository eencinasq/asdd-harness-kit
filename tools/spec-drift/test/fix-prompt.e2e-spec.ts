/** spec-drift-demand REQ-002 end to end: the fix-rule-violations prompt over a Semgrep fixture repo. */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { createSemgrepSpecRepo, hasSemgrep, tmpDir } from './fixtures/sandbox.ts';

describe('fix-rule-violations prompt', { skip: !hasSemgrep() && 'semgrep not installed' }, () => {
	let moduleRef: TestingModule;
	let client: Client;
	let repo: string;

	before(async () => {
		repo = createSemgrepSpecRepo();
		Object.assign(process.env, { ANALYSIS_REPO_ROOT: repo, PR_REVIEW_ROOT: tmpDir('sd-fix') });
		const { AppModule } = await import('../src/app.module.ts');
		moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleRef.init();
		client = await connectMcpClient(moduleRef);
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	const text = async (args: Record<string, string>) => {
		const r = await client.getPrompt({ name: 'fix-rule-violations', arguments: args });
		const content = r.messages[0]?.content as { text?: string } | undefined;
		return content?.text ?? '';
	};

	test('spec-drift-demand REQ-002: the prompt lists the rule violations and the steps; the server writes nothing', async () => {
		const before = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
		const prompt = await text({ rule_id: 'mmlc.std.no-explicit-any' });
		assert.match(prompt, /^Fix the 2 violations of rule `mmlc\.std\.no-explicit-any`/);
		assert.match(prompt, /- src\/domain\/order\.ts:\d+ — /);
		assert.match(prompt, /wait for their confirmation/);
		assert.match(await text({ rule_id: 'mmlc.std.no-explicit-any', max: '1' }), /the first 1 of 2/);
		assert.match(await text({ rule_id: 'nope' }), /No rule nope[\s\S]*Drifting rules: .*mmlc\.std\.no-explicit-any/);
		assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), before);
	});
});
