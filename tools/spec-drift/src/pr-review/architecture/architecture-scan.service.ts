import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { packsForMode } from '../../analysis/domain/pack-selection.ts';
import { isRulesPath } from '../../analysis/domain/rule-readiness.ts';
import { CODE_ANALYZER, type CodeAnalyzer } from '../../analysis/ports/code-analyzer.port.ts';
import type { Env } from '../../config/env.schema.ts';
import { BUILTIN_SECURITY_PACK_ID, builtinSecurityPack, SECURITY_SET } from '../../security/builtin-pack.ts';
import type {
	ArchitectureFinding,
	ArchitectureReviewView,
	BuiltinSecurityScan,
	RepoSecurityScan,
} from './architecture.types.ts';
import { buildRulesGeneratePrompt, buildSecurityRulesGeneratePrompt } from './architecture-report.ts';

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

	/**
	 * The repo's own rules on the PR files, plus security scans for the dashboard:
	 * built-in pack always on Semgrep (REQ-008), and always a repo-security result (findings or generate prompt).
	 */
	async scan(options: ScanOptions): Promise<ArchitectureReviewView> {
		const view = await this.scanRepoRules(options);
		const builtinSecurity = await this.scanBuiltinSecurity(options);
		const repoSecurity = await this.scanRepoSecurity(options);
		return {
			...view,
			...(builtinSecurity ? { builtinSecurity } : {}),
			repoSecurity,
		};
	}

	/**
	 * Kit starter security rules on the PR files (pr-security-baseline REQ-001/003 + dashboard-ux REQ-008).
	 * Always runs on Semgrep when there are scannable files — including when the repo has its own security set
	 * (that set is scanned separately as `repoSecurity`). Never throws: failures become an `error` note.
	 */
	private async scanBuiltinSecurity(options: ScanOptions): Promise<BuiltinSecurityScan | undefined> {
		const { engine } = this.analyzer;
		if (engine.id !== 'semgrep') return undefined;
		const targetPaths = this.codePaths(options);
		if (!targetPaths) return undefined;
		const packs = [builtinSecurityPack()];
		const base = { packId: BUILTIN_SECURITY_PACK_ID };
		try {
			const run = await this.analyzer.run({
				repoRoot: options.repoRoot,
				packs,
				rules: await this.analyzer.loadRules(packs),
				paths: targetPaths,
				targetRoot: options.targetRoot,
				exclude: [...EXCLUDES, engine.rulesDir],
				timeoutMs: this.timeoutMs,
			});
			if (run.status === 'failed') {
				return {
					...base,
					status: 'error',
					findingCount: 0,
					findings: [],
					message: `Built-in security pack: ${engine.name} failed (exit ${run.exitCode}); the review continues without it.`,
				};
			}
			const findings: ArchitectureFinding[] = run.findings.map(
				({ checkId, path, startLine, endLine, severity, message }) => ({
					checkId,
					path,
					startLine,
					endLine,
					severity,
					message,
				}),
			);
			return {
				...base,
				status: 'scanned',
				findingCount: findings.length,
				findings: findings.slice(0, MAX_FINDINGS),
				message: `Built-in security pack: ${findings.length} finding(s) on PR paths.`,
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const why = detail.includes('ENOENT')
				? `${engine.name} is not installed (or not on PATH)`
				: `${engine.name} could not run: ${detail}`;
			return {
				...base,
				status: 'error',
				findingCount: 0,
				findings: [],
				message: `Built-in security pack: ${why}; the review continues without it.`,
			};
		}
	}

	/**
	 * Repository `.semgrep/security/` (or engine equivalent) on the PR files.
	 * Always returns a view: `missing` + generatePrompt when the set is absent (REQ-007).
	 */
	private async scanRepoSecurity(options: ScanOptions): Promise<RepoSecurityScan> {
		const { engine } = this.analyzer;
		const generatePrompt = buildSecurityRulesGeneratePrompt({
			...options,
			engine,
			guide: this.analyzer.authoringGuide(),
		});
		const missing = (message: string): RepoSecurityScan => ({
			status: 'missing',
			findingCount: 0,
			findings: [],
			configFiles: [],
			message,
			generatePrompt,
		});

		let available: Awaited<ReturnType<CodeAnalyzer['listPacks']>> = [];
		try {
			available = await this.analyzer.listPacks(options.repoRoot);
		} catch {
			return missing(`No readable \`${engine.rulesDir}/\` — cannot load a security rule set.`);
		}
		const repoSet = available.find((p) => p.kind === 'set' && p.id === SECURITY_SET);
		if (!repoSet) {
			return missing(
				`No \`${engine.rulesDir}/security/\` rules. Generate a security set from best practices for this codebase’s area.`,
			);
		}
		const configFiles = repoSet.files.map((f) => f.slice(repoSet.path.length).replace(/^[/\\]/, '') || f);
		if (repoSet.files.length === 0) {
			return {
				...missing(`\`${engine.rulesDir}/security/\` exists but has no rule files.`),
				configFiles,
			};
		}

		const targetPaths = this.codePaths(options);
		if (!targetPaths) {
			return {
				status: 'scanned',
				findingCount: 0,
				findings: [],
				configFiles,
				message: 'No PR files to scan with the repository security rules.',
			};
		}

		try {
			const run = await this.analyzer.run({
				repoRoot: options.repoRoot,
				packs: [repoSet],
				rules: await this.analyzer.loadRules([repoSet]),
				paths: targetPaths,
				targetRoot: options.targetRoot,
				exclude: [...EXCLUDES, engine.rulesDir],
				timeoutMs: this.timeoutMs,
			});
			if (run.status === 'failed') {
				return {
					status: 'error',
					findingCount: 0,
					findings: [],
					configFiles,
					message: `Repository security rules: ${engine.name} failed (exit ${run.exitCode}).`,
				};
			}
			const findings: ArchitectureFinding[] = run.findings.map(
				({ checkId, path, startLine, endLine, severity, message }) => ({
					checkId,
					path,
					startLine,
					endLine,
					severity,
					message,
				}),
			);
			return {
				status: 'scanned',
				findingCount: findings.length,
				findings: findings.slice(0, MAX_FINDINGS),
				configFiles,
				message:
					findings.length === 0
						? `Repository security rules clean (${configFiles.length} rule file(s) under \`${engine.rulesDir}/security/\`).`
						: `Repository security rules: ${findings.length} finding(s) from \`${engine.rulesDir}/security/\` on PR paths.`,
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const why = detail.includes('ENOENT')
				? `${engine.name} is not installed (or not on PATH)`
				: `${engine.name} could not run: ${detail}`;
			return {
				status: 'error',
				findingCount: 0,
				findings: [],
				configFiles,
				message: `Repository security rules: ${why}.`,
			};
		}
	}

	/** Code paths to scan (rules folder excluded); `['.']` without a path list; null when nothing is left to scan. */
	private codePaths(options: ScanOptions): readonly string[] | null {
		const { engine } = this.analyzer;
		if (options.targetRoot !== undefined && !options.paths?.length) return null;
		const codePaths = options.paths?.filter((p) => !isRulesPath(engine.rulesDir, p));
		if (options.paths?.length && !codePaths?.length) return null;
		return codePaths?.length ? codePaths : ['.'];
	}

	private async scanRepoRules(options: ScanOptions): Promise<ArchitectureReviewView> {
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
		// Rule test fixtures (the rules folder) are not code; Semgrep scans explicit targets despite --exclude (rule-coverage REQ-003).
		const codePaths = options.paths?.filter((p) => !isRulesPath(engine.rulesDir, p));
		if (options.paths?.length && !codePaths?.length) {
			return {
				...base,
				status: 'scanned',
				scannedPaths: [],
				message: `No PR files to scan (only ${engine.rulesDir}/ rules and their tests changed).`,
			};
		}
		const targetPaths = codePaths?.length ? codePaths : ['.'];
		try {
			const packs = packsForMode('all', await this.analyzer.listPacks(options.repoRoot), undefined, engine.rulesDir);
			const run = await this.analyzer.run({
				repoRoot: options.repoRoot,
				packs,
				rules: await this.analyzer.loadRules(packs),
				// PR file names come from GitHub; the analyzer passes them after `--`.
				paths: targetPaths,
				targetRoot: options.targetRoot,
				exclude: [...EXCLUDES, engine.rulesDir],
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

type ScanOptions = {
	readonly repoRoot: string;
	readonly project: string;
	readonly paths?: readonly string[];
	/** Folder holding the PR's version of `paths` (see GithubService.materializePrFiles). */
	readonly targetRoot?: string;
	readonly pr?: number;
};
