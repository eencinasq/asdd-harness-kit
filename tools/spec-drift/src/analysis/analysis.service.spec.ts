/**
 * Proves the engine is replaceable: the whole spec-drift flow (and the PR architecture scan) runs on
 * an in-memory engine wired exactly like Semgrep would be, with no Semgrep binary involved. A CodeQL
 * adapter plugs in the same way.
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateEnv } from '../config/env.schema.ts';
import { ArchitectureScanService } from '../pr-review/architecture/architecture-scan.service.ts';
import { AnalysisModule } from './analysis.module.ts';
import { AnalysisService } from './analysis.service.ts';
import type { RuleMeta, RulePack } from './analysis.types.ts';
import {
	type AnalyzerRunRequest,
	type AnalyzerRunResult,
	CODE_ANALYZER,
	type CodeAnalyzer,
	type RulesLocation,
} from './ports/code-analyzer.port.ts';

const PACKS: RulePack[] = [
	{
		id: 'architecture',
		kind: 'set',
		path: '/q/architecture',
		set: 'architecture',
		files: ['/q/architecture/layers.ql'],
	},
	{
		id: 'layers',
		kind: 'file',
		path: '/q/architecture/layers.ql',
		set: 'architecture',
		files: ['/q/architecture/layers.ql'],
	},
];
const RULES: RuleMeta[] = [
	{
		id: 'js/layer-leak',
		severity: 'ERROR',
		message: 'Domain imports infra',
		category: 'architecture',
		adr: 'ADR-1',
		pack: 'layers',
		mode: 'problem',
	},
	{
		id: 'js/naming',
		severity: 'INFO',
		message: 'Naming',
		category: 'architecture',
		adr: null,
		pack: 'layers',
		mode: 'problem',
	},
];

@Injectable()
class FakeCodeqlAnalyzer implements CodeAnalyzer {
	readonly engine = { id: 'codeql', name: 'CodeQL', rulesDir: 'codeql' };
	readonly runs: AnalyzerRunRequest[] = [];

	async inspect(repoRoot: string): Promise<RulesLocation> {
		return { rulesDir: `${repoRoot}/codeql`, exists: true, ruleFiles: ['architecture/layers.ql'] };
	}
	async listPacks(): Promise<RulePack[]> {
		return PACKS;
	}
	async loadRules(): Promise<RuleMeta[]> {
		return RULES;
	}
	async run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult> {
		this.runs.push(request);
		return {
			status: 'ok',
			exitCode: 0,
			stderrTail: '',
			findings: [
				{
					checkId: 'js/layer-leak',
					path: 'src/domain/a.ts',
					startLine: 3,
					endLine: 3,
					severity: 'ERROR',
					message: 'leak',
					category: 'architecture',
					adr: 'ADR-1',
					pack: 'layers',
				},
				{
					checkId: 'js/naming',
					path: 'src/b.ts',
					startLine: 1,
					endLine: 1,
					severity: 'INFO',
					message: 'name',
					category: 'architecture',
					adr: null,
					pack: 'layers',
				},
			],
		};
	}
	authoringGuide(): readonly string[] {
		return ['Write .ql queries under codeql/architecture/.'];
	}
}

@Module({
	providers: [FakeCodeqlAnalyzer, { provide: CODE_ANALYZER, useExisting: FakeCodeqlAnalyzer }],
	exports: [CODE_ANALYZER],
})
class FakeCodeqlEngineModule {}

const compile = () =>
	Test.createTestingModule({
		imports: [
			ConfigModule.forRoot({
				isGlobal: true,
				ignoreEnvFile: true,
				validate: () => validateEnv({ ANALYSIS_REPO_ROOT: '/repo' }),
			}),
			AnalysisModule.forRoot({ engine: FakeCodeqlEngineModule }),
		],
		providers: [ArchitectureScanService],
	}).compile();

describe('AnalysisModule with a replacement engine', () => {
	test('spec drift runs end to end on the configured engine', async () => {
		const moduleRef = await compile();
		const summary = await moduleRef.get(AnalysisService).scan({ mode: 'architecture' });

		assert.deepEqual(summary.engine, { id: 'codeql', name: 'CodeQL', rulesDir: 'codeql' });
		assert.equal(summary.findingCount, 2);
		assert.equal(summary.drift.driftingRules, 2);
		assert.deepEqual(summary.packs, ['architecture']);
		const run = moduleRef.get(FakeCodeqlAnalyzer).runs.at(-1);
		assert.equal(run?.repoRoot, '/repo');
		assert.ok((run?.timeoutMs ?? 0) > 0);
	});

	test('the minimum severity filter is applied by the use case, not the engine', async () => {
		const moduleRef = await compile();
		const summary = await moduleRef.get(AnalysisService).scan({ mode: 'spec-drift', severity: 'WARNING' });
		assert.equal(summary.findingCount, 1);
		assert.deepEqual(
			summary.rules.map((r) => r.id),
			['js/layer-leak'],
		);
	});

	test('the PR architecture scan uses the same engine', async () => {
		const moduleRef = await compile();
		const view = await moduleRef
			.get(ArchitectureScanService)
			.scan({ repoRoot: '/pr', project: 'demo', paths: ['src/a.ts'] });
		assert.equal(view.status, 'scanned');
		assert.equal(view.engine?.name, 'CodeQL');
		assert.equal(view.rulesDir, '/pr/codeql');
		assert.equal(view.findingCount, 2);
		assert.deepEqual(moduleRef.get(FakeCodeqlAnalyzer).runs.at(-1)?.paths, ['src/a.ts']);
	});

	test('rule-coverage REQ-003: the rules folder is excluded, and explicit paths under it are dropped', async () => {
		const moduleRef = await compile();
		const engine = moduleRef.get(FakeCodeqlAnalyzer);
		await moduleRef.get(AnalysisService).scan({ mode: 'all', paths: ['src', 'codeql/architecture/layers.ts'] });
		assert.ok(engine.runs.at(-1)?.exclude?.includes('codeql'), 'the rules folder is excluded');
		assert.deepEqual(engine.runs.at(-1)?.paths, ['src']);
		const runs = engine.runs.length;
		const only = await moduleRef.get(AnalysisService).scan({ mode: 'all', paths: ['codeql/architecture/layers.ts'] });
		assert.equal(engine.runs.length, runs, 'nothing to scan when only rule files were named');
		assert.equal(only.findingCount, 0);
		const pr = await moduleRef
			.get(ArchitectureScanService)
			.scan({ repoRoot: '/pr', project: 'demo', paths: ['src/a.ts', 'codeql/x.ts'] });
		assert.equal(pr.status, 'scanned');
		assert.deepEqual(engine.runs.at(-1)?.paths, ['src/a.ts']);
		assert.ok(engine.runs.at(-1)?.exclude?.includes('codeql'));
	});

	test('rule-coverage REQ-004: an engine without rule tests is never ready', async () => {
		const moduleRef = await compile();
		const summary = await moduleRef.get(AnalysisService).scan({ mode: 'all' });
		assert.equal(summary.ruleTests?.status, 'unavailable');
		const report = await moduleRef.get(AnalysisService).validateRules();
		assert.equal(report.ready, 0);
		assert.ok(report.rules.every((r) => r.test === 'unavailable' && r.flags.includes('tests-unavailable')));
		assert.match(report.tests.message ?? '', /CodeQL adapter has no rule tests/);
	});
});
