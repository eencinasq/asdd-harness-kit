import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mcpRequestContext } from '../common/mcp/mcp-request-context.ts';
import type { Env } from '../config/env.schema.ts';
import {
	type AdrCoverageResult,
	type Finding,
	type RuleMeta,
	type RulePack,
	type RuleTestReport,
	type ScanMode,
	type ScanSummary,
	SEVERITIES,
	type Severity,
} from './analysis.types.ts';
import { buildAdrRulePrompt, computeAdrCoverage, locateAdrs, readAdrs } from './domain/adr-coverage.ts';
import {
	BASELINE_FILE,
	type BaselineFile,
	buildBaseline,
	compareWithBaseline,
	fingerprintOf,
	parseBaseline,
} from './domain/baseline.ts';
import { countBy } from './domain/count-by.ts';
import {
	describeOrigin,
	LOG_FORMAT,
	type OriginCommit,
	parseBlamePorcelain,
	parseLogLine,
} from './domain/drift-origin.ts';
import { buildDriftReport } from './domain/drift-report.ts';
import { packsForMode, UnknownPackError } from './domain/pack-selection.ts';
import { buildPackSummaries } from './domain/pack-summary.ts';
import { type RepoData, type RepoSummary, summarizeRepo } from './domain/repos-overview.ts';
import { isRulesPath, type ReadinessReport, ruleReadiness } from './domain/rule-readiness.ts';
import { buildRulesPrompt } from './domain/rules-prompt.ts';
import {
	auditPoint,
	buildTrend,
	countKeys,
	HISTORY_DIR,
	type Snapshot,
	snapshotPoint,
	type Trend,
	type TrendPoint,
} from './domain/trend.ts';
import { CODE_ANALYZER, type CodeAnalyzer } from './ports/code-analyzer.port.ts';

export type ScanOptions = {
	readonly mode: ScanMode;
	/** Pack ids (see listPacks); overrides the mode. */
	readonly packs?: readonly string[];
	readonly paths?: readonly string[];
	/** Minimum severity to report. */
	readonly severity?: Severity;
};

/** Folders never scanned in the spec repo. */
const EXCLUDES = ['node_modules', 'dist', '.wiki', 'tools/spec-drift', 'tools/spec-drift'];

/** Max findings returned in a summary (the counts always cover every finding). */
const MAX_FINDINGS = 500;

const atLeast = (min: Severity | undefined) => {
	const rank = min ? SEVERITIES.indexOf(min) : SEVERITIES.length;
	return (severity: Severity) => SEVERITIES.indexOf(severity) <= rank;
};

/**
 * Spec-drift use case: runs the configured analyzer (Semgrep by default, see CODE_ANALYZER) with the
 * rule packs of ANALYSIS_REPO_ROOT and compares findings with the declared rules. Knows nothing about
 * the engine's CLI or output format.
 */
@Injectable()
export class AnalysisService {
	/** Repo whose rule packs are scanned (ANALYSIS_REPO_ROOT). */
	readonly repoRoot: string;
	private readonly timeoutMs: number;
	/** Repo with the asdd harness (HARNESS_ROOT): its `.harness/audits/` reports are the audit trend. */
	private readonly harnessRoot: string;
	/** Repositories of the multi-repo overview (SPEC_DRIFT_REPOS). */
	private readonly repos: readonly string[];

	constructor(
		@Inject(CODE_ANALYZER) private readonly analyzer: CodeAnalyzer,
		@Inject(ConfigService) config: ConfigService<Env, true>,
	) {
		this.repoRoot = config.get('ANALYSIS_REPO_ROOT', { infer: true });
		this.harnessRoot = config.get('HARNESS_ROOT', { infer: true });
		this.repos = (config.get('SPEC_DRIFT_REPOS', { infer: true }) ?? []).map((r: string) => path.resolve(r));
		this.timeoutMs = config.get('ANALYSIS_TIMEOUT_SECONDS', { infer: true }) * 1000;
	}

	get engine() {
		return this.analyzer.engine;
	}

	listPacks(): Promise<RulePack[]> {
		return this.analyzer.listPacks(this.repoRoot);
	}

	async scan(options: ScanOptions): Promise<ScanSummary> {
		return (await this.scanWithFindings(options)).summary;
	}

	/**
	 * Which rules are ready to accept (rule-coverage REQ-004): every rule of the repo, its test result, and its hits on the
	 * repository (all findings, not the dashboard's first 500). Reads only.
	 */
	/** Every finding of a whole-repository scan (not only the summary's first 500), for the fix prompt. */
	async scanAll(): Promise<{ summary: ScanSummary; findings: Finding[] }> {
		return this.scanWithFindings({ mode: 'all' });
	}

	async validateRules(): Promise<ReadinessReport & { readonly scan: Pick<ScanSummary, 'status' | 'stderrTail'> }> {
		const { summary, findings } = await this.scanWithFindings({ mode: 'all' });
		const tests = summary.ruleTests ?? (await this.ruleTests());
		const report = ruleReadiness(summary.rules, findings, tests, summary.status !== 'failed');
		return { ...report, scan: { status: summary.status, stderrTail: summary.stderrTail } };
	}

	/** The engine's rule tests; `unavailable` (never a pass) when it has none or cannot run them. */
	private async ruleTests(): Promise<RuleTestReport> {
		if (!this.analyzer.testRules) {
			return {
				status: 'unavailable',
				byRule: {},
				invalidFiles: [],
				message: `The ${this.analyzer.engine.name} adapter has no rule tests.`,
			};
		}
		return this.analyzer.testRules(this.repoRoot, this.timeoutMs);
	}

	private async scanWithFindings(options: ScanOptions): Promise<{ summary: ScanSummary; findings: Finding[] }> {
		const context = mcpRequestContext.current();
		const { engine } = this.analyzer;
		const available = await this.listPacks();
		const adrCoverage = await this.adrCoverage(available).catch(() => null);
		const packs = this.selectPacks(options, available);
		if (!packs?.length)
			return { summary: { ...this.noRules(options.mode, packs === null), adrCoverage }, findings: [] };
		await context.reportProgress(0, 3, `Running ${engine.name} (${packs.map((p) => p.id).join(', ') || 'no packs'})`);

		const rules = await this.analyzer.loadRules(packs);
		// The rules folder holds test fixtures that violate the rules on purpose: never scanned as code (REQ-003). Semgrep
		// does not apply --exclude to explicit targets, so named paths are filtered too.
		const paths = options.paths?.filter((p) => !isRulesPath(engine.rulesDir, p));
		const onlyRules = Boolean(options.paths?.length) && !paths?.length;
		const run = onlyRules
			? {
					status: 'ok' as const,
					exitCode: 0,
					findings: [],
					stderrTail: `Only ${engine.rulesDir}/ paths were given; they are not code.`,
				}
			: await this.analyzer.run({
					repoRoot: this.repoRoot,
					packs,
					rules,
					paths,
					exclude: [...EXCLUDES, engine.rulesDir],
					timeoutMs: this.timeoutMs,
				});
		await context.reportProgress(1, 3, 'Running the rule tests');
		const ruleTests = await this.ruleTests();
		await context.reportProgress(2, 3, 'Building drift report');

		const keep = atLeast(options.severity);
		const scopedRules = rules.filter((r) => keep(r.severity));
		const kept = run.findings.filter((f) => keep(f.severity));
		const { findings, baseline } = this.applyBaseline(kept, this.isWholeScan(options));
		await context.reportProgress(3, 3, `${findings.length} finding(s)`);

		return {
			findings,
			summary: {
				engine,
				scannedAt: new Date().toISOString(),
				repoRoot: this.repoRoot,
				mode: options.mode,
				packs: packs.map((p) => p.id),
				status: run.status,
				exitCode: run.exitCode,
				findingCount: findings.length,
				bySeverity: countBy(findings, 'severity'),
				byPack: countBy(findings, 'pack'),
				byRule: countBy(findings, 'checkId'),
				findings: findings.slice(0, MAX_FINDINGS),
				rules: scopedRules,
				drift: buildDriftReport(scopedRules, findings),
				packSummaries: buildPackSummaries(findings, countBy(scopedRules, 'pack')),
				stderrTail: run.stderrTail,
				adrCoverage,
				ruleTests,
				baseline,
				trend: this.analysisTrendForDashboard(),
			},
		};
	}

	// ── Trend (spec-drift-adoption REQ-002) ───────────────────────────────────

	/** Folder of the dated snapshots, repository-relative (`.semgrep/history`). */
	get historyDir(): string {
		return path.posix.join(this.analyzer.engine.rulesDir, HISTORY_DIR);
	}

	/** A snapshot of a whole-repository scan, for the `spec-drift record` command to write. Writes nothing. */
	async buildSnapshot(commit: string | null): Promise<{ snapshot: Snapshot; summary: ScanSummary }> {
		const { summary, findings } = await this.scanWithFindings({ mode: 'all' });
		const snapshot: Snapshot = {
			schema_version: '1.0',
			recorded_at: new Date().toISOString(),
			commit,
			engine: this.analyzer.engine.id,
			total: findings.length,
			new: summary.baseline ? summary.baseline.new : null,
			by_severity: countKeys(findings, (f) => f.severity),
			by_rule: countKeys(findings, (f) => f.checkId),
			by_adr: countKeys(findings, (f) => f.adr),
			by_pack: countKeys(findings, (f) => f.pack),
			rules: summary.rules.length,
			adr_coverage: summary.adrCoverage?.coverage ?? null,
		};
		return { snapshot, summary };
	}

	/** The recorded snapshots, oldest first; unreadable files are skipped. */
	history(root: string = this.repoRoot): { file: string; snapshot: Snapshot }[] {
		const dir = path.join(root, this.historyDir);
		if (!existsSync(dir)) return [];
		return readdirSync(dir)
			.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
			.sort()
			.flatMap((n) => {
				try {
					const snapshot = JSON.parse(readFileSync(path.join(dir, n), 'utf8')) as Snapshot;
					return snapshot?.recorded_at && typeof snapshot.total === 'number'
						? [{ file: `${this.historyDir}/${n}`, snapshot }]
						: [];
				} catch {
					return [];
				}
			});
	}

	/**
	 * Several repositories at a glance (spec-drift-demand REQ-006): each one's latest snapshot, trend, and latest audit
	 * report, from `SPEC_DRIFT_REPOS`. Reads files only; runs no scan.
	 */
	reposOverview(): { repos: RepoSummary[]; configured: boolean } {
		const roots = this.repos.length ? this.repos : [this.repoRoot];
		const repos = roots.map((root): RepoSummary => {
			const name = path.basename(root);
			if (!existsSync(root))
				return summarizeRepo({ name, root, snapshots: [], audit: null, error: `no folder ${root}` });
			const auditsDir = path.join(root, '.harness/audits');
			const latest = existsSync(auditsDir)
				? readdirSync(auditsDir)
						.filter((n) => n.endsWith('.json') && n !== 'triage.json')
						.sort()
						.at(-1)
				: undefined;
			let audit: RepoData['audit'] = null;
			if (latest) {
				try {
					audit = { file: latest, report: JSON.parse(readFileSync(path.join(auditsDir, latest), 'utf8')) };
				} catch {
					audit = null;
				}
			}
			return summarizeRepo({ name, root, snapshots: this.history(root), audit });
		});
		return { repos, configured: this.repos.length > 0 };
	}

	/** The kit's audit reports (`.harness/audits/<timestamp>.json` under HARNESS_ROOT) as trend points. */
	private auditPoints(by: 'check' | 'slice' | 'severity'): TrendPoint[] {
		const dir = path.join(this.harnessRoot, '.harness/audits');
		if (!existsSync(dir)) return [];
		return readdirSync(dir)
			.filter((n) => n.endsWith('.json') && n !== 'triage.json')
			.sort()
			.flatMap((n) => {
				try {
					const point = auditPoint(`.harness/audits/${n}`, JSON.parse(readFileSync(path.join(dir, n), 'utf8')), by);
					return point ? [point] : [];
				} catch {
					return [];
				}
			});
	}

	/** Drift over time from the analysis snapshots or the audit reports (`drift_trend`). Reads only. */
	trend(options: {
		readonly source: 'analysis' | 'audit';
		readonly by?: 'rule' | 'adr' | 'pack' | 'severity' | 'check' | 'slice';
		readonly limit?: number;
	}): Trend & { readonly source: 'analysis' | 'audit'; readonly by: string; readonly where: string } {
		if (options.source === 'audit') {
			const by = options.by === 'slice' || options.by === 'severity' ? options.by : 'check';
			return {
				source: 'audit',
				by,
				where: path.join(this.harnessRoot, '.harness/audits'),
				...buildTrend(this.auditPoints(by), options.limit),
			};
		}
		const by = options.by === 'adr' || options.by === 'pack' || options.by === 'severity' ? options.by : 'rule';
		const points = this.history().map(({ file, snapshot }) => snapshotPoint(file, snapshot, by));
		return {
			source: 'analysis',
			by,
			where: path.join(this.repoRoot, this.historyDir),
			...buildTrend(points, options.limit),
		};
	}

	/** The last 12 snapshots for the dashboard chart; null without history. */
	private analysisTrendForDashboard(): ScanSummary['trend'] {
		try {
			const points = this.history().map(({ file, snapshot }) => snapshotPoint(file, snapshot, 'rule'));
			if (!points.length) return null;
			const { changes: _changes, ...trend } = buildTrend(points, 12);
			return trend;
		} catch {
			return null;
		}
	}

	/** Path of the baseline file, repository-relative (`.semgrep/baseline.json`). */
	get baselineFile(): string {
		return path.posix.join(this.analyzer.engine.rulesDir, BASELINE_FILE);
	}

	/**
	 * A baseline of every current finding (spec-drift-adoption REQ-001), for the `spec-drift baseline` command to write.
	 * Builds it from a whole-repository scan; writes nothing.
	 */
	async buildBaseline(): Promise<{ baseline: BaselineFile; summary: ScanSummary }> {
		const { summary, findings } = await this.scanWithFindings({ mode: 'all' });
		const fingerprints = this.fingerprints(findings);
		return { baseline: buildBaseline(fingerprints, this.analyzer.engine.id), summary };
	}

	/** A scan that covers every rule and file, so a baseline finding it does not see is resolved. */
	private isWholeScan(options: ScanOptions): boolean {
		return (
			(options.mode === 'all' || options.mode === 'spec-drift') &&
			!options.paths?.length &&
			!options.packs?.length &&
			!options.severity
		);
	}

	/** Fingerprint per finding, from the text of its first line (read once per file). */
	private fingerprints(findings: readonly Finding[]): string[] {
		const files = new Map<string, string[]>();
		const lineOf = (file: string, line: number): string => {
			if (!files.has(file)) {
				let lines: string[] = [];
				try {
					lines = readFileSync(path.join(this.repoRoot, file), 'utf8').split('\n');
				} catch {
					// unreadable: the line number stands in for the text
				}
				files.set(file, lines);
			}
			return files.get(file)?.[line - 1] ?? `@${line}`;
		};
		return findings.map((f) => fingerprintOf(f.checkId, f.path, lineOf(f.path, f.startLine)));
	}

	/** Mark findings new / existing against `.semgrep/baseline.json`, when the repo has one. */
	private applyBaseline(
		findings: readonly Finding[],
		wholeScan: boolean,
	): { findings: Finding[]; baseline: ScanSummary['baseline'] } {
		let text: string | null = null;
		try {
			text = readFileSync(path.join(this.repoRoot, this.baselineFile), 'utf8');
		} catch {
			text = null;
		}
		const parsed = parseBaseline(text);
		if (!parsed) return { findings: [...findings], baseline: null };
		const { marks, status } = compareWithBaseline(this.fingerprints(findings), parsed, this.baselineFile, wholeScan);
		return { findings: findings.map((f, i) => ({ ...f, baseline: marks[i] })), baseline: status };
	}

	/**
	 * Which ADRs the repo's rules enforce (rule-coverage REQ-001): every rule of every pack against the ADR files, and per
	 * uncovered ADR the prompt that asks the host agent for its rule (REQ-002). Reads only.
	 */
	// ── Drift origin (spec-drift-demand REQ-001) ─────────────────────────────

	private gitOut(args: readonly string[]): Promise<string | null> {
		return new Promise((resolve) => {
			execFile(
				'git',
				[...args],
				{ cwd: this.repoRoot, maxBuffer: 16 * 1024 * 1024, timeout: this.timeoutMs },
				(error, stdout) => resolve(error ? null : stdout),
			);
		});
	}

	/** The commit that last changed `file:line` and the oldest one that added its text. Reads only. */
	async driftOrigin(file: string, line: number) {
		const abs = path.join(this.repoRoot, file);
		const text = existsSync(abs) ? readFileSync(abs, 'utf8').split('\n') : null;
		if (!text) throw new BadRequestException(`No file ${file} in ${this.repoRoot}.`);
		if (line < 1 || line > text.length) {
			throw new BadRequestException(`${file} has ${text.length} lines; line ${line} does not exist.`);
		}
		const content = (text[line - 1] ?? '').trim();
		const blame = parseBlamePorcelain(
			(await this.gitOut(['blame', '-L', `${line},${line}`, '--porcelain', '--', file])) ?? '',
		);
		// The pickaxe needs some text to be meaningful; it searches only this file's history.
		const log =
			content.length >= 4
				? await this.gitOut(['log', '-S', content, '--reverse', `--format=${LOG_FORMAT}`, '--', file])
				: null;
		const introduced: OriginCommit | null = log ? (log.split('\n').map(parseLogLine).find(Boolean) ?? null) : null;
		const committed = blame?.committed ?? false;
		const lastChange: OriginCommit | null =
			blame && committed
				? { sha: blame.sha, author: blame.author, date: blame.date, subject: blame.subject, pr: blame.pr }
				: null;
		return {
			path: file,
			line,
			text: content,
			committed,
			lastChange,
			introduced,
			summary: describeOrigin({ path: file, line, lastChange, committed, introduced }),
		};
	}

	async adrCoverage(available?: readonly RulePack[]): Promise<AdrCoverageResult> {
		const packs = packsForMode('all', available ?? (await this.listPacks()), undefined, this.analyzer.engine.rulesDir);
		const rules: readonly RuleMeta[] = packs.length ? await this.analyzer.loadRules(packs) : [];
		const location = locateAdrs(this.repoRoot);
		const coverage = computeAdrCoverage(location, location.dir ? readAdrs(this.repoRoot, location.dir) : [], rules);
		return { ...coverage, uncovered: coverage.uncovered.map((adr) => ({ ...adr, prompt: this.adrRulePrompt(adr) })) };
	}

	/** The prompt for one ADR's rule (MCP prompt `write-adr-rule`). */
	adrRulePrompt(adr: { readonly id: string; readonly title: string; readonly path: string }): string {
		return buildAdrRulePrompt({
			adr,
			repoRoot: this.repoRoot,
			engine: this.analyzer.engine,
			guide: this.analyzer.authoringGuide(),
		});
	}

	/** The prompt that asks the host agent to write a first rule set for a repo (spec-drift-empty REQ-002). */
	rulesPrompt(repoRoot: string = this.repoRoot): string {
		return buildRulesPrompt({
			repoRoot,
			project: path.basename(repoRoot),
			engine: this.analyzer.engine,
			guide: this.analyzer.authoringGuide(),
			harness: existsSync(path.join(repoRoot, '.harness')),
			done: 'After creating the rules, call `analyze_spec_drift` to scan with them (and `verify_architecture_rules` when the repo uses the asdd harness).',
		});
	}

	/** Nothing to analyze for this mode (spec-drift-empty REQ-001): not an error, and never a pass. */
	private noRules(mode: ScanMode, missingSet: boolean): ScanSummary {
		const { engine } = this.analyzer;
		const what = missingSet ? `no \`${engine.rulesDir}/${mode}/\` rules` : `no rules under \`${engine.rulesDir}/\``;
		return {
			engine,
			scannedAt: new Date().toISOString(),
			repoRoot: this.repoRoot,
			mode,
			packs: [],
			status: 'no-rules',
			message: `${path.basename(this.repoRoot)} has ${what}: nothing was analyzed (this is not a pass).`,
			generatePrompt: this.rulesPrompt(),
			exitCode: 0,
			findingCount: 0,
			bySeverity: {},
			byPack: {},
			byRule: {},
			findings: [],
			rules: [],
			drift: { totalRules: 0, cleanRules: 0, driftingRules: 0, items: [], topDrifts: [] },
			packSummaries: [],
			stderrTail: '',
		};
	}

	/** Packs to scan; null when the mode's rule set does not exist and no pack was named (no rules, not bad input). */
	private selectPacks(options: ScanOptions, available: readonly RulePack[]): RulePack[] | null {
		try {
			return packsForMode(options.mode, available, options.packs, this.analyzer.engine.rulesDir);
		} catch (error) {
			if (!(error instanceof UnknownPackError)) throw error;
			if (options.packs?.length) throw new BadRequestException(error.message);
			return null;
		}
	}
}
