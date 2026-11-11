import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { packsForMode } from '../../analysis/domain/pack-selection.ts';
import { CODE_ANALYZER, type CodeAnalyzer } from '../../analysis/ports/code-analyzer.port.ts';
import type { Env } from '../../config/env.schema.ts';
import type { ArchitectureReviewView } from './architecture.types.ts';
import { buildRulesGeneratePrompt } from './architecture-report.ts';

const EXCLUDES = ['node_modules', 'dist'];
const MAX_FINDINGS = 200;

/**
 * Runs the reviewed repo's own rules (e.g. `.semgrep/`) on the PR's files with the configured
 * analyzer. Never throws for a missing config or a failed run: it returns a status the dashboard can
 * act on (e.g. "Ask the agent to write rules", with an agent prompt).
 */
@Injectable()
export class ArchitectureScanService {
	private readonly timeoutMs: number;

	constructor(
		@Inject(CODE_ANALYZER) private readonly analyzer: CodeAnalyzer,
		@Inject(ConfigService) config: ConfigService<Env, true>,
	) {
		this.timeoutMs = config.get('ANALYSIS_TIMEOUT_SECONDS', { infer: true }) * 1000;
	}

	/** An `error` view (e.g. the PR's files could not be read), keeping missing-rules guidance. */
	async failed(
		options: { readonly repoRoot: string; readonly project: string; readonly pr?: number },
		message: string,
		detail: string,
	): Promise<ArchitectureReviewView> {
		const { engine } = this.analyzer;
		const location = await this.analyzer.inspect(options.repoRoot);
		return {
			engine,
			status: 'error',
			rulesDir: location.rulesDir,
			configFiles: location.ruleFiles,
			findingCount: 0,
			findings: [],
			scannedPaths: [],
			message: `${message}.`,
			stderrTail: detail,
		};
	}

	async scan(options: {
		readonly repoRoot: string;
		readonly project: string;
		readonly paths?: readonly string[];
		/** Folder holding the PR's version of `paths` (see GithubService.materializePrFiles). */
		readonly targetRoot?: string;
		readonly pr?: number;
	}): Promise<ArchitectureReviewView> {
		const { engine } = this.analyzer;
		const location = await this.analyzer.inspect(options.repoRoot);
		const generatePrompt = buildRulesGeneratePrompt({ ...options, engine, guide: this.analyzer.authoringGuide() });
		const base = {
			engine,
			rulesDir: location.rulesDir,
			configFiles: location.ruleFiles,
			findingCount: 0,
			findings: [],
		};

		if (!location.exists) {
			return {
				...base,
				status: 'missing-config',
				scannedPaths: [],
				message: `No \`${engine.rulesDir}/\` in ${options.project}. Generate project architecture rules before ${engine.name} can run.`,
				generatePrompt,
			};
		}
		if (location.ruleFiles.length === 0) {
			return {
				...base,
				status: 'empty-config',
				scannedPaths: [],
				message: `\`${engine.rulesDir}/\` exists but has no rules. Add rules or regenerate.`,
				generatePrompt,
			};
		}

		// With a snapshot, scan exactly the given files; none left (all deleted by the PR) means nothing to scan.
		if (options.targetRoot !== undefined && !options.paths?.length) {
			return {
				...base,
				status: 'scanned',
				scannedPaths: [],
				message: 'No PR files to scan (the PR only deletes files).',
			};
		}
		const targetPaths = options.paths?.length ? [...options.paths] : ['.'];
		try {
			const packs = packsForMode('all', await this.analyzer.listPacks(options.repoRoot), undefined, engine.rulesDir);
			const run = await this.analyzer.run({
				repoRoot: options.repoRoot,
				packs,
				rules: await this.analyzer.loadRules(packs),
				// PR file names come from GitHub; the analyzer passes them after `--`.
				paths: targetPaths,
				targetRoot: options.targetRoot,
				exclude: EXCLUDES,
				timeoutMs: this.timeoutMs,
			});
			if (run.status === 'failed') {
				return {
					...base,
					status: 'error',
					scannedPaths: targetPaths,
					message: `${engine.name} failed (exit ${run.exitCode}).`,
					stderrTail: run.stderrTail,
				};
			}
			const findings = run.findings.map(({ checkId, path, startLine, endLine, severity, message }) => ({
				checkId,
				path,
				startLine,
				endLine,
				severity,
				message,
			}));
			return {
				...base,
				status: 'scanned',
				findingCount: findings.length,
				findings: findings.slice(0, MAX_FINDINGS),
				scannedPaths: targetPaths,
				message:
					findings.length === 0
						? `Architecture scan clean (${location.ruleFiles.length} rule file(s), ${targetPaths.length} path(s)).`
						: `Architecture scan: ${findings.length} finding(s) from \`${engine.rulesDir}\` on PR paths.`,
				stderrTail: run.stderrTail,
			};
		} catch (error) {
			// The analyzer could not start (e.g. ENOENT: not installed).
			const message = error instanceof Error ? error.message : String(error);
			const notInstalled = message.includes('ENOENT');
			return {
				...base,
				status: 'error',
				scannedPaths: targetPaths,
				message: notInstalled
					? `${engine.name} is not installed (or not on PATH).`
					: `${engine.name} could not run: ${message}`,
				stderrTail: message,
			};
		}
	}
}
