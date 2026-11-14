/**
 * spec-drift-adoption REQ-001 end to end with Semgrep: `spec-drift baseline --write` (a command a person runs) records
 * today's findings; the read-only MCP tools then show what is new, existing, and resolved.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import type { TestingModule } from '@nestjs/testing';

type Json = Record<string, any>;

const ROOT = path.resolve(import.meta.dirname, '..');
const hasSemgrep = (() => {
	try {
		execFileSync('semgrep', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();
const skip = !hasSemgrep && 'semgrep not installed';

let repo: string;
let moduleRef: TestingModule;
let client: Client;

const write = (rel: string, text: string) => {
	mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
	writeFileSync(path.join(repo, rel), text);
};
const cli = (...args: string[]) =>
	execFileSync(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args, '--repo', repo], {
		cwd: ROOT,
		encoding: 'utf8',
	});
const scan = async () =>
	(await client.callTool({ name: 'analyze_spec_drift', arguments: {} })).structuredContent as Json;

before(async () => {
	repo = mkdtempSync(path.join(os.tmpdir(), 'sd-baseline-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	write(
		'.semgrep/standards/logging.yml',
		'rules:\n  - id: demo.no-console\n    languages: [typescript]\n    severity: WARNING\n    message: Use the logger.\n    pattern: console.log(...)\n',
	);
	write('src/a.ts', 'export const a = () => {\n\tconsole.log("a");\n};\n');
	write('src/b.ts', 'export const b = () => {\n\tconsole.log("b");\n};\n');
	process.env['ANALYSIS_REPO_ROOT'] = repo;
	process.env['HARNESS_ROOT'] = repo;
	process.env['PR_REVIEW_ROOT'] = mkdtempSync(path.join(os.tmpdir(), 'sd-baseline-art-'));
	const { AppModule } = await import('../src/app.module.ts');
	const { Test } = await import('@nestjs/testing');
	moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	await moduleRef.init();
	client = await connectMcpClient(moduleRef);
});

after(async () => {
	await client?.close();
	await moduleRef?.close();
	rmSync(repo, { recursive: true, force: true });
});

test('spec-drift-adoption REQ-001: no baseline → baseline null; the dry run writes nothing', { skip }, async () => {
	assert.equal((await scan())['baseline'], null);
	assert.match(cli('baseline'), /2 finding\(s\).*\nDry run/s);
	assert.equal(existsSync(path.join(repo, '.semgrep/baseline.json')), false);
});

test('spec-drift-adoption REQ-001: after baseline --write, existing findings are not new; moved, added and removed lines are told apart', {
	skip,
}, async () => {
	assert.match(cli('baseline', '--write'), /Wrote .*baseline\.json/);
	const file = JSON.parse(readFileSync(path.join(repo, '.semgrep/baseline.json'), 'utf8'));
	assert.equal(file.total, 2);
	let s = await scan();
	assert.deepEqual([s['baseline']['new'], s['baseline']['existing'], s['baseline']['resolved']], [0, 2, 0]);
	assert.ok(s['findings'].every((f: Json) => f['baseline'] === 'existing'));

	// A moved line keeps its fingerprint; a new call is new; a removed one is resolved.
	write('src/a.ts', '// header\n\nexport const a = () => {\n\tconsole.log("a");\n};\n');
	write('src/c.ts', 'export const c = () => {\n\tconsole.log("c");\n};\n');
	write('src/b.ts', 'export const b = () => 1;\n');
	s = await scan();
	assert.deepEqual([s['baseline']['new'], s['baseline']['existing'], s['baseline']['resolved']], [1, 1, 1]);
	assert.deepEqual(
		s['findings'].filter((f: Json) => f['baseline'] === 'new').map((f: Json) => f['path']),
		['src/c.ts'],
	);
	const text = ((await client.callTool({ name: 'analyze_spec_drift', arguments: {} })).content as { text: string }[])[0]
		?.text;
	assert.match(text ?? '', /1 new, 1 existing, 1 resolved/);
	const limited = (await client.callTool({ name: 'analyze_spec_drift', arguments: { paths: ['src'] } }))
		.structuredContent as Json;
	assert.equal(limited['baseline']['resolved'], null, 'a limited scan cannot tell resolved');
	assert.equal(
		readFileSync(path.join(repo, '.semgrep/baseline.json'), 'utf8'),
		`${JSON.stringify(file, null, 2)}\n`,
		'the MCP tools never rewrite the baseline',
	);
});
