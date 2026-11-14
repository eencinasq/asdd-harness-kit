/** spec-drift-demand REQ-001 end to end: drift_origin over a throwaway git repo. */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { DriftOriginOutput } from '../src/analysis/analysis.output.ts';
import { tmpDir } from './fixtures/sandbox.ts';

type Json = Record<string, any>;
const git = (cwd: string, author: string, ...args: string[]) =>
	execFileSync(
		'git',
		['-c', `user.name=${author}`, '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args],
		{
			cwd,
			encoding: 'utf8',
		},
	);

let repo: string;
let moduleRef: TestingModule;
let client: Client;
const call = async (args: Json) => {
	const r = await client.callTool({ name: 'drift_origin', arguments: args });
	return { isError: r.isError === true, s: (r.structuredContent ?? {}) as Json, text: JSON.stringify(r.content) };
};

before(async () => {
	repo = tmpDir('sd-origin');
	git(repo, 'Ada', 'init', '-q', '-b', 'main');
	fs.mkdirSync(path.join(repo, 'src'));
	fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 1;\n');
	git(repo, 'Ada', 'add', '-A');
	git(repo, 'Ada', 'commit', '-q', '-m', 'init');
	fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 1;\nconsole.log("debug");\n');
	git(repo, 'Bo', 'commit', '-qam', 'feat: add logging (#12)');
	fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 2;\nconsole.log("debug");\n');
	git(repo, 'Cy', 'commit', '-qam', 'Merge pull request #15 from org/bump');
	fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 2;\nconsole.log("debug");\nlet x = 3;\n');
	Object.assign(process.env, { ANALYSIS_REPO_ROOT: repo, PR_REVIEW_ROOT: tmpDir('sd-origin-art') });
	const { AppModule } = await import('../src/app.module.ts');
	moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	await moduleRef.init();
	client = await connectMcpClient(moduleRef);
});

after(async () => {
	await client?.close();
	await moduleRef?.close();
});

test('spec-drift-demand REQ-001: the commit and PR that introduced a line, read-only', async () => {
	const { isError, s } = await call({ path: 'src/a.ts', line: 2 });
	assert.equal(isError, false);
	assert.ok(DriftOriginOutput.safeParse(s).success);
	assert.equal(s['text'], 'console.log("debug");');
	assert.equal(s['lastChange']['author'], 'Bo');
	assert.equal(s['lastChange']['pr'], 12);
	assert.equal(s['introduced']['pr'], 12);
	assert.match(s['summary'], /Last change: [0-9a-f]{10} by Bo on .* \(PR #12\): feat: add logging/);
	const changed = (await call({ path: 'src/a.ts', line: 1 })).s;
	assert.equal(changed['lastChange']['pr'], 15, 'the last change of line 1 came in PR #15');
	assert.equal(changed['introduced']['pr'], 15, 'its current text first appeared there too');
	const local = (await call({ path: 'src/a.ts', line: 3 })).s;
	assert.equal(local['committed'], false);
	assert.match(local['summary'], /not committed yet/);
	assert.match(
		execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }),
		/^ M src\/a\.ts\n$/,
		'nothing else changed',
	);
});

test('spec-drift-demand REQ-001: a missing file or line, or a path outside the repo, is an error', async () => {
	assert.match((await call({ path: 'src/none.ts', line: 1 })).text, /No file src\/none\.ts/);
	assert.match((await call({ path: 'src/a.ts', line: 99 })).text, /has 4 lines; line 99 does not exist/);
	assert.equal((await call({ path: '../etc/passwd', line: 1 })).isError, true);
});
