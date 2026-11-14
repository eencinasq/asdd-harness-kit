/**
 * rule-coverage REQ-003, REQ-004 end to end with Semgrep: rule test fixtures in .semgrep/ are never findings, the scan
 * summary carries each rule's test result, and validate_rules says which rules are ready — writing nothing.
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
import type { TestingModule } from '@nestjs/testing';

import { ValidateRulesOutput } from '../src/analysis/analysis.output.ts';

type Json = Record<string, any>;

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

before(async () => {
	repo = mkdtempSync(path.join(os.tmpdir(), 'sd-rule-tests-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	write(
		'.semgrep/architecture/logging.yml',
		[
			'rules:',
			'  - id: demo.no-console',
			'    languages: [typescript]',
			'    severity: WARNING',
			'    message: Use the logger.',
			'    pattern: console.log(...)',
			'  - id: demo.no-debugger',
			'    languages: [typescript]',
			'    severity: INFO',
			'    message: Remove debugger.',
			'    pattern: debugger',
			'',
		].join('\n'),
	);
	// The test fixture violates demo.no-console on purpose; it must never count as a finding.
	write(
		'.semgrep/architecture/logging.ts',
		[
			'// ruleid: demo.no-console',
			'console.log("flagged");',
			'// ok: demo.no-console',
			'logger.info("fine");',
			'',
		].join('\n'),
	);
	write('src/app.ts', 'export const start = () => {\n\tconsole.log("start");\n};\n');
	process.env['ANALYSIS_REPO_ROOT'] = repo;
	process.env['HARNESS_ROOT'] = repo;
	process.env['PR_REVIEW_ROOT'] = mkdtempSync(path.join(os.tmpdir(), 'sd-rule-tests-art-'));
	// ConfigModule.forRoot reads the environment when AppModule is evaluated: import it after setting it.
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

test('rule-coverage REQ-003: rule test fixtures are not findings; the summary carries the test results', {
	skip,
}, async () => {
	const r = await client.callTool({ name: 'analyze_spec_drift', arguments: {} });
	assert.notEqual(r.isError, true);
	const s = r.structuredContent as Json;
	assert.deepEqual(
		s['findings'].map((f: Json) => f['path']),
		['src/app.ts'],
		'only product code, never .semgrep/',
	);
	assert.deepEqual(s['ruleTests']['byRule'], { 'demo.no-console': 'passed' });
	const named = await client.callTool({
		name: 'analyze_spec_drift',
		arguments: { paths: ['.semgrep/architecture/logging.ts'] },
	});
	assert.equal((named.structuredContent as Json)['findingCount'], 0, 'a named fixture is not scanned either');
});

test('rule-coverage REQ-004: validate_rules — the tested rule is ready, the untested one is not', {
	skip,
}, async () => {
	const r = await client.callTool({ name: 'validate_rules', arguments: {} });
	assert.notEqual(r.isError, true);
	const s = r.structuredContent as Json;
	assert.ok(ValidateRulesOutput.safeParse(s).success, 'matches its output schema');
	const by = Object.fromEntries(s['rules'].map((x: Json) => [x['id'], x]));
	assert.deepEqual(
		[by['demo.no-console']['test'], by['demo.no-console']['hits'], by['demo.no-console']['ready']],
		['passed', 1, true],
	);
	assert.deepEqual([by['demo.no-debugger']['test'], by['demo.no-debugger']['flags']], ['missing', ['no-test']]);
	assert.deepEqual([s['ready'], s['notReady']], [1, 1]);
	assert.match((r.content as { text: string }[])[0]?.text ?? '', /demo\.no-debugger .*no test file/);
});
