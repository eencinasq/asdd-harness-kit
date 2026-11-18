import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProcessRunner } from '../../common/process/process-runner.service.ts';
import type { Env } from '../../config/env.schema.ts';
import type { CodeCoverageView } from './code-coverage.types.ts';
import { buildCodeCoverageGeneratePrompt } from './code-coverage-report.ts';
import {
	coverageCommand,
	detectJsCoverageSetup,
	detectPackageManager,
	type PackageJsonLite,
} from './detect-js-coverage.ts';
import { parseCoverageSummary } from './parse-coverage-summary.ts';

export type { CodeCoverageView };

const CONFIG_CANDIDATES = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.config.mjs',
	'vite.config.ts',
	'jest.config.ts',
	'jest.config.mts',
	'jest.config.js',
	'jest.config.cjs',
	'jest.config.mjs',
	'jest.config.json',
	'.nycrc',
	'.nycrc.json',
	'.nycrc.yml',
	'nyc.config.js',
] as const;

const exists = (file: string): Promise<boolean> =>
	fs
		.access(file)
		.then(() => true)
		.catch(() => false);

const readPackageJson = async (repoRoot: string): Promise<PackageJsonLite | undefined> => {
	try {
		const raw = await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8');
		return JSON.parse(raw) as PackageJsonLite;
	} catch {
		return undefined;
	}
};

/**
 * Runs JS/TS unit tests with Istanbul-style coverage when the reviewed repo is configured for it;
 * otherwise returns `missing` + generatePrompt (pr-review-dashboard-ux REQ-014…016).
 */
@Injectable()
export class CodeCoverageScanService {
	private readonly timeoutMs: number;

	constructor(
		@Inject(ProcessRunner) private readonly process: ProcessRunner,
		@Inject(ConfigService) config: ConfigService<Env, true>,
	) {
		this.timeoutMs = config.get('COMMAND_TIMEOUT_SECONDS', { infer: true }) * 1000;
	}

	async scan(options: {
		readonly repoRoot: string;
		readonly project: string;
		readonly pr?: number;
		readonly paths: readonly string[];
	}): Promise<CodeCoverageView> {
		const generatePrompt = buildCodeCoverageGeneratePrompt(options);
		const pkg = await readPackageJson(options.repoRoot);
		const present = new Set<string>();
		for (const name of CONFIG_CANDIDATES) {
			if (await exists(path.join(options.repoRoot, name))) present.add(name);
		}
		const packageManager = detectPackageManager({
			pnpm: await exists(path.join(options.repoRoot, 'pnpm-lock.yaml')),
			yarn: await exists(path.join(options.repoRoot, 'yarn.lock')),
			npm: await exists(path.join(options.repoRoot, 'package-lock.json')),
		});
		const setup = detectJsCoverageSetup({ pkg, files: present, packageManager });
		if (!setup) {
			return {
				status: 'missing',
				files: [],
				message:
					'No JS/TS unit-test + coverage setup found (Jest, Vitest, c8, or nyc). Ask the agent to add tests and Istanbul-style coverage.',
				generatePrompt,
			};
		}

		const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-review-coverage-'));
		const { command, args } = coverageCommand(setup, reportDir);
		const labeled = `${command} ${args.join(' ')}`;
		try {
			const result = await this.process.run(command, args, {
				cwd: options.repoRoot,
				timeoutMs: this.timeoutMs,
				env: {
					CI: 'true',
					FORCE_COLOR: '0',
					npm_config_yes: 'false',
				},
			});
			const summaryPath = path.join(reportDir, 'coverage-summary.json');
			const summaryRaw = await fs.readFile(summaryPath, 'utf8').catch(() => undefined);
			if (!summaryRaw) {
				const tail = (result.stderr || result.stdout).trim().slice(-2_000);
				return {
					status: 'error',
					tool: setup.tool,
					packageManager: setup.packageManager,
					files: [],
					command: labeled,
					message: `Coverage run finished (exit ${result.code}) but no coverage-summary.json was written.`,
					stderrTail: tail || undefined,
				};
			}
			const { totals, files } = parseCoverageSummary(summaryRaw, options.paths);
			const prHint =
				files.length > 0
					? ` · ${files.length} PR file(s) in report`
					: options.paths.some((p) => /\.(m?[jt]sx?|cjs|mjs)$/.test(p))
						? ' · no PR JS/TS files in the summary'
						: '';
			return {
				status: 'scanned',
				tool: setup.tool,
				packageManager: setup.packageManager,
				totals,
				files,
				command: labeled,
				message: `${setup.tool} coverage: ${totals.linesPct}% lines (${totals.linesCovered}/${totals.linesTotal})${prHint}.`,
				...(result.code !== 0
					? { stderrTail: (result.stderr || result.stdout).trim().slice(-2_000) || undefined }
					: {}),
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				status: 'error',
				tool: setup.tool,
				packageManager: setup.packageManager,
				files: [],
				command: labeled,
				message: `Code coverage run failed (${setup.tool}). The review continues without a coverage %.`,
				stderrTail: detail.slice(-2_000),
			};
		} finally {
			await fs.rm(reportDir, { recursive: true, force: true });
		}
	}
}
