import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import type { Finding, RulePack } from '../../analysis/analysis.types.ts';
import type { AnalyzerRunRequest, CodeAnalyzer, RulesLocation } from '../../analysis/ports/code-analyzer.port.ts';
import type { Env } from '../../config/env.schema.ts';
import { BUILTIN_SECURITY_PACK_ID } from '../../security/builtin-pack.ts';
import { staticAnalysisHints } from '../pr-review.views.ts';
import type { ArchitectureReviewView } from './architecture.types.ts';
import { architecturePromptSection, architectureReportSection } from './architecture-report.ts';
import { ArchitectureScanService } from './architecture-scan.service.ts';

const finding = (checkId: string, path: string, startLine: number): Finding => ({
	checkId,
	path,
	startLine,
	endLine: startLine,
	severity: 'ERROR',
	message: `${checkId} message`,
	category: 'security',
	adr: null,
	pack: 'p',
});

type FakeOptions = {
	readonly engineId?: string;
	readonly location?: Partial<RulesLocation>;
	readonly packs?: readonly RulePack[];
	readonly repoFindings?: readonly Finding[];
	readonly securityFindings?: readonly Finding[];
	readonly builtinFindings?: readonly Finding[];
	readonly builtinError?: Error;
};

/** A CodeAnalyzer stub: records every run request and answers repo / security-set / built-in pack runs separately. */
const fakeAnalyzer = (o: FakeOptions = {}) => {
	const runs: AnalyzerRunRequest[] = [];
	const analyzer: CodeAnalyzer = {
		engine: { id: o.engineId ?? 'semgrep', name: o.engineId === 'codeql' ? 'CodeQL' : 'Semgrep', rulesDir: '.semgrep' },
		inspect: async () => ({
			rulesDir: '/repo/.semgrep',
			exists: true,
			ruleFiles: ['architecture/a.yml'],
			...o.location,
		}),
		listPacks: async () => [
			...(o.packs ?? [
				{
					id: 'architecture',
					kind: 'set',
					path: '/repo/.semgrep/architecture',
					set: 'architecture',
					files: ['/repo/.semgrep/architecture/a.yml'],
				},
			]),
		],
		loadRules: async () => [],
		run: async (request) => {
			runs.push(request);
			const builtin = request.packs.some((p) => p.id === BUILTIN_SECURITY_PACK_ID);
			const securityOnly = request.packs.length === 1 && request.packs[0]?.id === 'security';
			if (builtin && o.builtinError) throw o.builtinError;
			return {
				status: 'ok',
				exitCode: 0,
				findings: [
					...(builtin ? (o.builtinFindings ?? []) : securityOnly ? (o.securityFindings ?? []) : (o.repoFindings ?? [])),
				],
				stderrTail: '',
			};
		},
		authoringGuide: () => ['Put YAML rules under the rules folder.'],
	};
	return { analyzer, runs };
};

const config = { get: () => 60 } as unknown as ConfigService<Env, true>;
const scanOptions = { repoRoot: '/repo', project: 'repo', paths: ['src/api/run.js'], targetRoot: '/snapshot', pr: 7 };

describe('pr-security-baseline REQ-001 REQ-002 REQ-003 built-in security pack in the PR scan', () => {
	it('REQ-001 runs the built-in pack on the PR files at the head snapshot when the repo has no security set', async () => {
		const { analyzer, runs } = fakeAnalyzer({
			builtinFindings: [finding('security.js.command-injection', 'src/api/run.js', 3)],
		});
		const view = await new ArchitectureScanService(analyzer, config).scan(scanOptions);
		assert.equal(view.status, 'scanned', 'repo rules still ran');
		const builtinRun = runs.find((r) => r.packs.some((p) => p.id === BUILTIN_SECURITY_PACK_ID));
		assert.ok(builtinRun, 'the built-in pack ran');
		assert.deepEqual(builtinRun.paths, ['src/api/run.js']);
		assert.equal(builtinRun.targetRoot, '/snapshot');
		assert.equal(view.builtinSecurity?.status, 'scanned');
		assert.deepEqual(
			view.builtinSecurity?.findings.map((f) => `${f.path}:${f.startLine}`),
			['src/api/run.js:3'],
		);
		assert.equal(
			view.findings.length,
			0,
			'built-in findings never mix into the repo findings (import indices stay stable)',
		);
	});

	it('REQ-001 also runs when the repo has no rules folder at all', async () => {
		const { analyzer } = fakeAnalyzer({
			location: { exists: false, ruleFiles: [] },
			packs: [],
			builtinFindings: [finding('security.py.shell-true', 'app.py', 2)],
		});
		const view = await new ArchitectureScanService(analyzer, config).scan({ ...scanOptions, paths: ['app.py'] });
		assert.equal(view.status, 'missing-config');
		assert.equal(view.builtinSecurity?.findings.length, 1);
	});

	it('REQ-002 skips built-in only on non-Semgrep or with no scannable files (dashboard-ux REQ-008 always runs with a repo security set)', async () => {
		const withSet = fakeAnalyzer({
			packs: [
				{
					id: 'security',
					kind: 'set',
					path: '/repo/.semgrep/security',
					set: 'security',
					files: ['/repo/.semgrep/security/s.yml'],
				},
			],
			builtinFindings: [finding('security.js.command-injection', 'src/api/run.js', 2)],
			securityFindings: [finding('security.repo.rule', 'src/api/run.js', 3)],
		});
		const a = await new ArchitectureScanService(withSet.analyzer, config).scan(scanOptions);
		assert.equal(a.builtinSecurity?.status, 'scanned');
		assert.ok(withSet.runs.some((r) => r.packs.some((p) => p.id === BUILTIN_SECURITY_PACK_ID)));
		assert.equal(a.repoSecurity?.status, 'scanned');
		assert.equal(a.repoSecurity?.findingCount, 1);

		const codeql = fakeAnalyzer({ engineId: 'codeql' });
		assert.equal(
			(await new ArchitectureScanService(codeql.analyzer, config).scan(scanOptions)).builtinSecurity,
			undefined,
		);

		const deletesOnly = fakeAnalyzer();
		const c = await new ArchitectureScanService(deletesOnly.analyzer, config).scan({ ...scanOptions, paths: [] });
		assert.equal(c.builtinSecurity, undefined);
		assert.equal(deletesOnly.runs.length, 0);
	});

	it('pr-review-dashboard-ux REQ-006 REQ-007 REQ-008: repo security when present; generatePrompt when missing; built-in always', async () => {
		const missing = await new ArchitectureScanService(fakeAnalyzer().analyzer, config).scan(scanOptions);
		assert.equal(missing.repoSecurity?.status, 'missing');
		assert.match(missing.repoSecurity?.generatePrompt ?? '', /Generate \.semgrep\/security security rules/);
		assert.match(missing.repoSecurity?.generatePrompt ?? '', /pr_review_architecture_rescan/);
		assert.equal(missing.builtinSecurity?.status, 'scanned');

		const withSet = fakeAnalyzer({
			packs: [
				{
					id: 'architecture',
					kind: 'set',
					path: '/repo/.semgrep/architecture',
					set: 'architecture',
					files: ['/repo/.semgrep/architecture/a.yml'],
				},
				{
					id: 'security',
					kind: 'set',
					path: '/repo/.semgrep/security',
					set: 'security',
					files: ['/repo/.semgrep/security/s.yml'],
				},
			],
			builtinFindings: [finding('security.js.command-injection', 'src/api/run.js', 2)],
			securityFindings: [finding('security.repo.xss', 'src/api/run.js', 4)],
		});
		const present = await new ArchitectureScanService(withSet.analyzer, config).scan(scanOptions);
		assert.equal(present.repoSecurity?.status, 'scanned');
		assert.deepEqual(
			present.repoSecurity?.findings.map((f) => f.checkId),
			['security.repo.xss'],
		);
		assert.equal(present.repoSecurity?.generatePrompt, undefined);
		assert.equal(present.builtinSecurity?.status, 'scanned');
		assert.equal(present.builtinSecurity?.findingCount, 1);
	});

	it('REQ-003 a failed built-in run is a note; the repo result is unchanged', async () => {
		const { analyzer } = fakeAnalyzer({
			repoFindings: [finding('architecture.no-x', 'src/api/run.js', 1)],
			builtinError: new Error('spawn semgrep ENOENT'),
		});
		const view = await new ArchitectureScanService(analyzer, config).scan(scanOptions);
		assert.equal(view.status, 'scanned');
		assert.equal(view.findings.length, 1);
		assert.equal(view.builtinSecurity?.status, 'error');
		assert.match(view.builtinSecurity?.message ?? '', /built-in security/i);
	});
});

describe('pr-security-baseline REQ-001 built-in findings reach the group hints, the prompt and the report, labeled', () => {
	const view: ArchitectureReviewView = {
		status: 'missing-config',
		rulesDir: '/repo/.semgrep',
		configFiles: [],
		findingCount: 0,
		findings: [],
		scannedPaths: [],
		message: 'No `.semgrep/` in repo.',
		builtinSecurity: {
			status: 'scanned',
			packId: BUILTIN_SECURITY_PACK_ID,
			findingCount: 1,
			findings: [
				{
					checkId: 'security.js.command-injection',
					path: 'src/api/run.js',
					startLine: 3,
					endLine: 3,
					severity: 'ERROR',
					message: 'shell command from a dynamic value',
				},
			],
			message: 'Built-in security pack: 1 finding(s) on PR paths (the repository has no `.semgrep/security/` rules).',
		},
	};

	it('group hints carry a built-in security block for the group files only', () => {
		const hints = staticAnalysisHints({ architecture: view }, { files: ['src/api/run.js'] });
		assert.match(hints, /<static-analysis source="built-in security pack"/);
		assert.match(hints, /src\/api\/run\.js:3 \[security\.js\.command-injection\]/);
		assert.equal(staticAnalysisHints({ architecture: view }, { files: ['src/other.js'] }), '');
	});

	it('prompt and report name the built-in pack and its findings', () => {
		assert.match(architecturePromptSection(view), /Built-in security pack/);
		assert.match(architecturePromptSection(view), /src\/api\/run\.js:3/);
		assert.match(architectureReportSection(view), /Built-in security pack/);
		assert.match(architectureReportSection(view), /security\.js\.command-injection/);
	});
});
