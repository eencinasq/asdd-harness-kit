/**
 * rule-coverage REQ-001, REQ-002 end to end: adr_coverage over a repo with ADR files and rules, the write-adr-rule
 * prompt, and the scan summary's adrCoverage — reading only.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import type { TestingModule } from '@nestjs/testing';

import { AdrCoverageOutput } from '../src/analysis/analysis.output.ts';

type Json = Record<string, any>;

let repo: string;
let moduleRef: TestingModule;
let client: Client;

const write = (rel: string, text: string) => {
	mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
	writeFileSync(path.join(repo, rel), text);
};

const listing = (): string =>
	readdirSync(repo, { recursive: true })
		.map(String)
		.filter((f) => !f.startsWith('.git/') && f !== '.git')
		.map((f) => `${f}:${statSync(path.join(repo, f)).mtimeMs}`)
		.sort()
		.join('\n');

before(async () => {
	repo = mkdtempSync(path.join(os.tmpdir(), 'sd-rule-coverage-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	write(
		'docs/decisions/0001-layers.md',
		'# ADR-0001: Domain does not import infrastructure\n\n## Status\n\nAccepted\n',
	);
	write('docs/decisions/0002-money.md', '# ADR-0002: Money as integer cents\n\n## Status\n\nAccepted\n');
	write('docs/decisions/0003-hosting.md', '# ADR-0003: Host on Fly\n\n## Status\n\nAccepted\n\nEnforcement: manual\n');
	write(
		'.semgrep/architecture/boundaries.yml',
		[
			'rules:',
			'  - id: demo.no-infra-in-domain',
			'    languages: [typescript]',
			'    severity: ERROR',
			'    message: Domain must not import infrastructure.',
			'    metadata: { category: architecture, adr: ADR-1 }',
			'    pattern-regex: from .*infrastructure',
			'  - id: demo.legacy',
			'    languages: [typescript]',
			'    severity: INFO',
			'    message: Legacy.',
			'    metadata: { adr: ADR-0009 }',
			'    pattern-regex: legacy',
			'',
		].join('\n'),
	);
	write('src/a.ts', 'export const a = 1;\n');
	process.env['ANALYSIS_REPO_ROOT'] = repo;
	process.env['HARNESS_ROOT'] = repo;
	process.env['PR_REVIEW_ROOT'] = mkdtempSync(path.join(os.tmpdir(), 'sd-rule-coverage-art-'));
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

test('rule-coverage REQ-001: adr_coverage reports covered, uncovered, exempt and dangling — and writes nothing', async () => {
	const before = listing();
	const r = await client.callTool({ name: 'adr_coverage', arguments: {} });
	assert.notEqual(r.isError, true);
	const s = r.structuredContent as Json;
	assert.ok(AdrCoverageOutput.safeParse(s).success, 'matches its output schema');
	assert.deepEqual([s['dir'], s['source']], ['docs/decisions', 'default']);
	assert.deepEqual([s['total'], s['enforceable'], s['covered'], s['coverage']], [3, 2, 1, 0.5]);
	assert.deepEqual(
		s['uncovered'].map((u: Json) => u['id']),
		['ADR-0002'],
	);
	assert.match(s['uncovered'][0]['prompt'], /metadata\.adr: ADR-0002/);
	assert.deepEqual(s['dangling'], [{ ruleId: 'demo.legacy', adr: 'ADR-0009', reason: 'no ADR file' }]);
	const text = (r.content as { text: string }[])[0]?.text ?? '';
	assert.match(text, /1 of 2 enforceable ADR\(s\) have a rule \(50%\)/);
	assert.match(text, /write-adr-rule/);
	assert.equal(listing(), before, 'no file written or touched');
});

test('rule-coverage REQ-002: write-adr-rule returns the prompt for one ADR, and says when the ADR is unknown', async () => {
	const ok = await client.getPrompt({ name: 'write-adr-rule', arguments: { adr_id: 'ADR-2' } });
	const text = ok.messages.map((m) => (m.content as { text?: string }).text ?? '').join('\n');
	assert.match(text, /^# Encode ADR-0002 as a Semgrep rule/);
	assert.match(text, /`docs\/decisions\/0002-money\.md`/);
	const unknown = await client.getPrompt({ name: 'write-adr-rule', arguments: { adr_id: 'ADR-77' } });
	assert.match(
		unknown.messages.map((m) => (m.content as { text?: string }).text ?? '').join('\n'),
		/No ADR ADR-77 .* Known: ADR-0001, ADR-0002, ADR-0003/,
	);
});

const hasSemgrep = (() => {
	try {
		execFileSync('semgrep', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

test('rule-coverage REQ-001: the scan summary carries the ADR coverage for the dashboard', {
	skip: !hasSemgrep && 'semgrep not installed',
}, async () => {
	const r = await client.callTool({ name: 'analyze_spec_drift', arguments: {} });
	assert.notEqual(r.isError, true);
	const coverage = (r.structuredContent as Json)['adrCoverage'];
	assert.equal(coverage['covered'], 1);
	assert.equal(coverage['uncovered'][0]['id'], 'ADR-0002');
});
