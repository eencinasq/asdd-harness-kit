/**
 * spec-drift-demand REQ-005 end to end: with SPEC_DRIFT_ENGINE=codeql the server runs on the CodeQL adapter (the
 * dependency-graph rules still join it). The CodeQL CLI is not needed to list packs and rules; a scan without it fails
 * with a message naming the CLI (unless it is installed).
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { tmpDir } from './fixtures/sandbox.ts';

const QUERY = `/**
 * @name No console.log
 * @kind problem
 * @problem.severity warning
 * @id demo/no-console-log
 * @tags standards
 */
import javascript
from CallExpr c
where c.getCalleeName() = "log"
select c, "Use the logger."
`;

const hasCodeql = (): boolean => {
	try {
		execFileSync('codeql', ['version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
};

let moduleRef: TestingModule;
let client: Client;

before(async () => {
	const repo = tmpDir('sd-codeql-e2e');
	fs.mkdirSync(path.join(repo, 'codeql/standards'), { recursive: true });
	fs.writeFileSync(path.join(repo, 'codeql/standards/console.ql'), QUERY);
	fs.mkdirSync(path.join(repo, 'src'));
	fs.writeFileSync(path.join(repo, 'src/a.ts'), 'console.log(1);\n');
	Object.assign(process.env, {
		SPEC_DRIFT_ENGINE: 'codeql',
		ANALYSIS_REPO_ROOT: repo,
		PR_REVIEW_ROOT: tmpDir('sd-codeql-art'),
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

test('spec-drift-demand REQ-005: the server lists CodeQL packs and runs (or names the missing CLI)', async () => {
	const packs = (await client.callTool({ name: 'list_rule_packs', arguments: {} })).structuredContent as Record<
		string,
		any
	>;
	assert.deepEqual(
		(packs['packs'] as { id: string }[]).map((p) => p.id),
		['standards', 'console'],
	);
	const scan = await client.callTool({ name: 'analyze_standards', arguments: {} });
	const text = JSON.stringify(scan.content);
	if (hasCodeql()) {
		assert.ok(!scan.isError, text);
		assert.equal((scan.structuredContent as Record<string, any>)['engine']['id'], 'codeql');
	} else {
		assert.equal(scan.isError, true);
		assert.match(text, /codeql CLI is not installed/);
	}
});
