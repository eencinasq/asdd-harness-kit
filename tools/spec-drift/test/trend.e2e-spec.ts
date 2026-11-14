/**
 * spec-drift-adoption REQ-002 end to end: `spec-drift record` (a command a person or CI runs) writes one snapshot per day;
 * drift_trend reads the snapshots or the kit's audit reports and says which way drift goes — the server writes nothing.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import type { TestingModule } from '@nestjs/testing';

import { TrendOutput } from '../src/analysis/analysis.output.ts';

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

let repo: string;
let moduleRef: TestingModule;
let client: Client;

const write = (rel: string, text: string) => {
	mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
	writeFileSync(path.join(repo, rel), text);
};
const trend = async (args: Json) => {
	const r = await client.callTool({ name: 'drift_trend', arguments: args });
	return {
		isError: r.isError === true,
		s: r.structuredContent as Json,
		text: (r.content as { text: string }[])[0]?.text ?? '',
	};
};

before(async () => {
	repo = mkdtempSync(path.join(os.tmpdir(), 'sd-trend-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	write(
		'.semgrep/standards/logging.yml',
		'rules:\n  - id: demo.no-console\n    languages: [typescript]\n    severity: WARNING\n    message: Use the logger.\n    pattern: console.log(...)\n',
	);
	write('src/a.ts', 'console.log("a");\n');
	process.env['ANALYSIS_REPO_ROOT'] = repo;
	process.env['HARNESS_ROOT'] = repo;
	process.env['PR_REVIEW_ROOT'] = mkdtempSync(path.join(os.tmpdir(), 'sd-trend-art-'));
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

test('spec-drift-adoption REQ-002: no history → no points and the command to record one', async () => {
	const r = await trend({});
	assert.equal(r.isError, false);
	assert.ok(TrendOutput.safeParse(r.s).success);
	assert.deepEqual([r.s['points'], r.s['direction']], [[], 'unknown']);
	assert.match(r.text, /spec-drift record/);
});

test('spec-drift-adoption REQ-002: record writes one snapshot per day; drift_trend compares the snapshots', {
	skip: !hasSemgrep && 'semgrep not installed',
}, async () => {
	// An older snapshot with more findings, as if recorded a week ago.
	write(
		'.semgrep/history/2026-01-01.json',
		JSON.stringify({
			schema_version: '1.0',
			recorded_at: '2026-01-01T00:00:00.000Z',
			commit: null,
			engine: 'semgrep',
			total: 4,
			new: null,
			by_severity: { WARNING: 4 },
			by_rule: { 'demo.no-console': 4 },
			by_adr: {},
			by_pack: { standards: 4 },
			rules: 1,
			adr_coverage: null,
		}),
	);
	const run = () =>
		execFileSync(process.execPath, ['--import', 'tsx', 'src/main.ts', 'record', '--repo', repo], {
			cwd: ROOT,
			encoding: 'utf8',
		});
	assert.match(run(), /Wrote .*history\/\d{4}-\d{2}-\d{2}\.json: 1 finding/);
	assert.match(run(), /Replaced /, 'the last run of the day wins');
	assert.equal(readdirSync(path.join(repo, '.semgrep/history')).length, 2);

	const before = readFileSync(path.join(repo, '.semgrep/history/2026-01-01.json'), 'utf8');
	const r = await trend({ source: 'analysis' });
	assert.ok(TrendOutput.safeParse(r.s).success);
	assert.deepEqual(
		r.s['points'].map((p: Json) => p['total']),
		[4, 1],
	);
	assert.deepEqual([r.s['measure'], r.s['direction']], ['total', 'better']);
	assert.deepEqual(r.s['changes'], [{ key: 'demo.no-console', first: 4, last: 1, delta: -3 }]);
	assert.match(r.text, /going down \(better\)/);
	const summary = (await client.callTool({ name: 'analyze_spec_drift', arguments: {} })).structuredContent as Json;
	assert.equal(summary['trend']['direction'], 'better', 'the dashboard gets the trend in every scan');
	assert.equal(
		readFileSync(path.join(repo, '.semgrep/history/2026-01-01.json'), 'utf8'),
		before,
		'the server writes nothing',
	);
});

test('spec-drift-adoption REQ-002: drift_trend over the kit audit reports, by check and by slice', async () => {
	const report = (at: string, findings: Json[]) => ({ generated_at: at, findings });
	write(
		'.harness/audits/2026-01-01T00-00-00-000Z.json',
		JSON.stringify(report('2026-01-01T00:00:00Z', [{ check: 'DRIFT-01', slice_id: 's1' }])),
	);
	write(
		'.harness/audits/2026-01-08T00-00-00-000Z.json',
		JSON.stringify(
			report('2026-01-08T00:00:00Z', [
				{ check: 'DRIFT-01', slice_id: 's1' },
				{ check: 'DRIFT-02', slice_id: 's2' },
				{ check: 'DRIFT-02', slice_id: 's2' },
			]),
		),
	);
	write('.harness/audits/triage.json', '{}');
	const byCheck = await trend({ source: 'audit' });
	assert.deepEqual([byCheck.s['by'], byCheck.s['direction']], ['check', 'worse']);
	assert.deepEqual(byCheck.s['changes'], [{ key: 'DRIFT-02', first: 0, last: 2, delta: 2 }]);
	const bySlice = await trend({ source: 'audit', by: 'slice' });
	assert.deepEqual(bySlice.s['changes'], [{ key: 's2', first: 0, last: 2, delta: 2 }]);
});
