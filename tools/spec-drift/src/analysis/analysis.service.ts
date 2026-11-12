import { existsSync } from 'node:fs';
import path from 'node:path';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mcpRequestContext } from '../common/mcp/mcp-request-context.ts';
import type { Env } from '../config/env.schema.ts';
import { type RulePack, type ScanMode, type ScanSummary, SEVERITIES, type Severity } from './analysis.types.ts';
import { countBy } from './domain/count-by.ts';
import { buildDriftReport } from './domain/drift-report.ts';
import { packsForMode, UnknownPackError } from './domain/pack-selection.ts';
import { buildPackSummaries } from './domain/pack-summary.ts';
import { buildRulesPrompt } from './domain/rules-prompt.ts';
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

	constructor(
		@Inject(CODE_ANALYZER) private readonly analyzer: CodeAnalyzer,
		@Inject(ConfigService) config: ConfigService<Env, true>,
	) {
		this.repoRoot = config.get('ANALYSIS_REPO_ROOT', { infer: true });
		this.timeoutMs = config.get('ANALYSIS_TIMEOUT_SECONDS', { infer: true }) * 1000;
	}

	get engine() {
		return this.analyzer.engine;
	}

	listPacks(): Promise<RulePack[]> {
		return this.analyzer.listPacks(this.repoRoot);
	}

	async scan(options: ScanOptions): Promise<ScanSummary> {
		const context = mcpRequestContext.current();
		const { engine } = this.analyzer;
		const packs = this.selectPacks(options, await this.listPacks());
		if (!packs?.length) return this.noRules(options.mode, packs === null);
		await context.reportProgress(0, 2, `Running ${engine.name} (${packs.map((p) => p.id).join(', ') || 'no packs'})`);

		const rules = await this.analyzer.loadRules(packs);
		const run = await this.analyzer.run({
			repoRoot: this.repoRoot,
			packs,
			rules,
			paths: options.paths,
			exclude: EXCLUDES,
			timeoutMs: this.timeoutMs,
		});
		await context.reportProgress(1, 2, 'Building drift report');

		const keep = atLeast(options.severity);
		const scopedRules = rules.filter((r) => keep(r.severity));
		const findings = run.findings.filter((f) => keep(f.severity));
		await context.reportProgress(2, 2, `${findings.length} finding(s)`);

		return {
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
		};
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
