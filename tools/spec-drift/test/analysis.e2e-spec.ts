/**
 * Deep e2e of the analysis tools with the default engine (real `semgrep`) against a sandbox spec
 * repo (see createSemgrepSpecRepo for the expected findings).
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';

import { AnalysisService } from '../src/analysis/analysis.service.ts';
import type { ScanSummary } from '../src/analysis/analysis.types.ts';
import { createSemgrepSpecRepo, hasSemgrep, tmpDir } from './fixtures/sandbox.ts';

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (r: CallResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');
const summaryOf = (r: CallResult): ScanSummary => {
	assert.ok(!r.isError, textOf(r));
	return r.structuredContent as unknown as ScanSummary;
};

const startServer = async (env: Record<string, string>) => {
	Object.assign(process.env, env);
	const { AppModule } = await import('../src/app.module.ts');
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	await moduleRef.init();
	return { moduleRef, client: await connectMcpClient(moduleRef) };
};

describe('analysis tools on the Semgrep engine (real semgrep, sandbox spec repo)', {
	skip: !hasSemgrep() && 'semgrep not installed',
}, () => {
	let moduleRef: TestingModule;
	let client: Client;
	let specRepo: string;
	const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

	before(async () => {
		specRepo = createSemgrepSpecRepo();
		({ moduleRef, client } = await startServer({
			ANALYSIS_REPO_ROOT: specRepo,
			PR_REVIEW_ROOT: tmpDir('mcp-e2e-artifacts'),
		}));
	});

	after(async () => {
		await client?.close();
		await moduleRef?.close();
	});

	test('list_rule_packs discovers sets and rule files under ANALYSIS_REPO_ROOT/.semgrep', async () => {
		const { packs } = (await call('list_rule_packs')).structuredContent as {
			packs: Array<{ id: string; path: string }>;
		};
		assert.deepEqual(
			packs.map((p) => p.id),
			['architecture', 'boundaries', 'standards', 'coding-standards'],
		);
		assert.ok(
			packs.every((p) => p.path.startsWith(`${specRepo}/.semgrep/`)),
			JSON.stringify(packs),
		);
	});

	test('analyze_spec_drift: findings, drift per rule, ADRs, severities', async () => {
		const result = await call('analyze_spec_drift');
		const s = summaryOf(result);
		assert.equal(s.mode, 'spec-drift');
		assert.deepEqual(s.packs, ['architecture', 'standards']);
		assert.equal(s.repoRoot, specRepo);
		assert.equal(s.findingCount, 4);
		assert.deepEqual(s.bySeverity, { ERROR: 1, WARNING: 2, INFO: 1 });
		assert.deepEqual(s.byPack, { boundaries: 1, 'coding-standards': 3 });

		assert.equal(s.drift.totalRules, 4);
		assert.equal(s.drift.driftingRules, 3);
		assert.equal(s.drift.cleanRules, 1);
		const byId = Object.fromEntries(s.drift.items.map((i) => [i.ruleId, i]));
		// Hyphenated ids must match their findings (regression: ids were cut at the first '-').
		assert.equal(byId['mmlc.arch.boundary.no-infra-in-domain']?.status, 'drifting');
		assert.equal(byId['mmlc.arch.boundary.no-infra-in-domain']?.adr, 'ADR-0010');
		assert.deepEqual(byId['mmlc.arch.boundary.no-infra-in-domain']?.samplePaths, ['src/domain/order.ts:1']);
		assert.equal(byId['mmlc.arch.boundary.no-ui-in-domain']?.status, 'clean');
		assert.equal(byId['mmlc.std.no-explicit-any']?.violationCount, 2);
		// Multi-line `message: >-` is folded.
		assert.equal(byId['mmlc.arch.boundary.no-infra-in-domain']?.message, 'Domain code must not import infrastructure.');
		// Top drifts are ordered by severity first.
		assert.equal(s.drift.topDrifts[0]?.ruleId, 'mmlc.arch.boundary.no-infra-in-domain');

		// Text fallback for hosts without the dashboard.
		const text = textOf(result);
		assert.match(text, /Semgrep spec-drift — 4 finding\(s\)/);
		assert.match(text, /Spec drift: 3\/4 rules violating/);
		assert.match(text, /\[ERROR\] mmlc\.arch\.boundary\.no-infra-in-domain ×1 \(ADR-0010\) @ src\/domain\/order\.ts:1/);
		assert.ok(s.packSummaries.length > 0);
	});

	test('reports progress while scanning', async () => {
		const updates: string[] = [];
		await client.callTool(
			{ name: 'analyze_standards', arguments: {} },
			{
				onprogress: (p: { progress: number; message?: string }) =>
					void updates.push(`${p.progress}:${p.message ?? ''}`),
			},
		);
		assert.ok(updates.length >= 2, JSON.stringify(updates));
		assert.match(updates[0] ?? '', /^0:Running Semgrep/);
	});

	test('analyze_architecture runs only the architecture pack', async () => {
		const s = summaryOf(await call('analyze_architecture'));
		assert.equal(s.mode, 'architecture');
		assert.deepEqual(s.packs, ['architecture']);
		assert.equal(s.findingCount, 1);
		assert.equal(s.drift.totalRules, 2);
	});

	test('analyze_standards runs only the standards pack', async () => {
		const s = summaryOf(await call('analyze_standards'));
		assert.equal(s.mode, 'standards');
		assert.equal(s.findingCount, 3);
		assert.ok(s.findings.every((f) => f.pack === 'coding-standards'));
	});

	test('severity filter keeps only that severity and above', async () => {
		const s = summaryOf(await call('analyze_spec_drift', { severity: 'ERROR' }));
		assert.equal(s.findingCount, 1);
		assert.deepEqual(Object.keys(s.bySeverity), ['ERROR']);
	});

	test('paths filter limits the scan', async () => {
		const s = summaryOf(await call('analyze_spec_drift', { paths: ['src/app'] }));
		assert.equal(s.findingCount, 2);
		assert.ok(s.findings.every((f) => f.path.startsWith('src/app/')));
	});

	test('explicit packs override the mode', async () => {
		const s = summaryOf(await call('analyze_spec_drift', { mode: 'architecture', packs: ['coding-standards'] }));
		assert.deepEqual(s.packs, ['coding-standards']);
		assert.equal(s.findingCount, 3);
	});

	test('rescan (dashboard) gives the same result as analyze_spec_drift', async () => {
		const a = summaryOf(await call('analyze_spec_drift'));
		const b = summaryOf(await call('rescan', { mode: 'spec-drift' }));
		assert.equal(b.findingCount, a.findingCount);
		assert.deepEqual(b.byRule, a.byRule);
	});

	test('rejects unknown packs, modes and severities', async () => {
		for (const args of [{ packs: ['nope'] }, { mode: 'everything' }, { severity: 'FATAL' }, { paths: 'src' }]) {
			assert.equal((await call('analyze_spec_drift', args)).isError, true, JSON.stringify(args));
		}
		// The scoped tools pin `mode`.
		assert.equal((await call('analyze_architecture', { mode: 'standards' })).isError, true);
	});

	test('rejects option-like, absolute and escaping paths (argument injection)', async () => {
		for (const p of ['--output=/tmp/x.json', '-o', '/etc', '../other-repo', 'src/../../x']) {
			const result = await call('analyze_spec_drift', { paths: [p] });
			assert.equal(result.isError, true, p);
		}
	});

	test('scan targets can never be parsed as semgrep options', async () => {
		const victim = path.join(tmpDir('mcp-e2e-victim'), 'important.txt');
		fs.writeFileSync(victim, 'ORIGINAL');
		// Bypass the schema to prove the service itself is safe.
		await moduleRef.get(AnalysisService).scan({ mode: 'spec-drift', paths: [`--output=${victim}`] });
		assert.equal(fs.readFileSync(victim, 'utf8'), 'ORIGINAL');
	});

	test('an unknown pack fails with the list of available packs', async () => {
		const result = await call('analyze_spec_drift', { packs: ['taint'] });
		assert.equal(result.isError, true);
		assert.match(
			textOf(result),
			/Unknown rule pack 'taint'\. Available: architecture, boundaries, standards, coding-standards/,
		);
	});

	test('a missing scan path does not crash the tool', async () => {
		const s = summaryOf(await call('analyze_spec_drift', { paths: ['does/not/exist'] }));
		assert.equal(s.findingCount, 0);
		assert.notEqual(s.exitCode, 0);
		assert.equal(s.status, 'failed', 'reported as a failed run, not a clean one');
		assert.ok(s.stderrTail.length > 0 || s.exitCode !== 0);
	});
});
