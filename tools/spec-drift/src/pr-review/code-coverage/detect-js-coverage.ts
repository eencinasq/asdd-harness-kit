/**
 * Detect a JS/TS unit-test + coverage setup (Jest, Vitest, c8, nyc) from package.json and config files.
 * Pure: the caller supplies file existence and package.json text.
 */
import type { CoverageTool, JsCoverageSetup, PackageManager } from './code-coverage.types.ts';

export type PackageJsonLite = {
	readonly scripts?: Readonly<Record<string, string>>;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
};

const hasDep = (pkg: PackageJsonLite, name: string): boolean =>
	Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);

const pickTestScript = (pkg: PackageJsonLite): string | undefined => {
	const scripts = pkg.scripts ?? {};
	for (const name of ['test:coverage', 'coverage', 'test']) {
		const value = scripts[name]?.trim();
		if (value) return name;
	}
	return undefined;
};

/** Prefer the package manager implied by lockfiles (caller passes which exist). */
export const detectPackageManager = (locks: {
	readonly pnpm: boolean;
	readonly yarn: boolean;
	readonly npm: boolean;
}): PackageManager => {
	if (locks.pnpm) return 'pnpm';
	if (locks.yarn) return 'yarn';
	if (locks.npm) return 'npm';
	return 'npm';
};

/**
 * Resolve which coverage tool to drive. Returns undefined when there is no usable unit-test + coverage setup.
 */
export const detectJsCoverageSetup = (options: {
	readonly pkg: PackageJsonLite | undefined;
	readonly files: ReadonlySet<string>;
	readonly packageManager: PackageManager;
}): JsCoverageSetup | undefined => {
	const { pkg, files, packageManager } = options;
	if (!pkg) return undefined;
	const testScript = pickTestScript(pkg);
	if (!testScript) return undefined;

	const hasVitestConfig = [...files].some((f) => /^vitest\.config\.(m?[jt]s|c?js)$/.test(f) || f === 'vite.config.ts');
	const hasJestConfig = [...files].some((f) => /^jest\.config\.(m?[jt]s|c?js)$/.test(f) || f === 'jest.config.json');
	const hasNyc =
		hasDep(pkg, 'nyc') ||
		[...files].some((f) => f === '.nycrc' || f === '.nycrc.json' || f === '.nycrc.yml' || f === 'nyc.config.js');
	const hasC8 = hasDep(pkg, 'c8');

	let tool: CoverageTool | undefined;
	if (hasDep(pkg, 'vitest') || hasVitestConfig) tool = 'vitest';
	else if (hasDep(pkg, 'jest') || hasDep(pkg, '@jest/core') || hasJestConfig) tool = 'jest';
	else if (hasC8) tool = 'c8';
	else if (hasNyc) tool = 'nyc';
	else if (hasDep(pkg, 'istanbul') || hasDep(pkg, 'babel-plugin-istanbul')) tool = 'nyc';

	if (!tool) return undefined;
	return { tool, packageManager, testScript };
};

/** Build argv to produce an Istanbul `coverage-summary.json` under `reportDir`. */
export const coverageCommand = (
	setup: JsCoverageSetup,
	reportDir: string,
): { readonly command: string; readonly args: readonly string[] } => {
	const { tool, packageManager, testScript } = setup;
	const exec =
		packageManager === 'pnpm'
			? { command: 'pnpm', prefix: ['exec'] as const }
			: packageManager === 'yarn'
				? { command: 'yarn', prefix: ['exec'] as const }
				: { command: 'npx', prefix: ['--no-install'] as const };

	if (tool === 'vitest') {
		return {
			command: exec.command,
			args: [
				...exec.prefix,
				'vitest',
				'run',
				'--coverage',
				'--coverage.reporter=json-summary',
				'--coverage.reporter=text-summary',
				`--coverage.reportsDirectory=${reportDir}`,
			],
		};
	}

	if (tool === 'jest') {
		return {
			command: exec.command,
			args: [
				...exec.prefix,
				'jest',
				'--coverage',
				'--coverageReporters=json-summary',
				'--coverageReporters=text-summary',
				`--coverageDirectory=${reportDir}`,
				'--passWithNoTests',
			],
		};
	}

	const wrapBin = tool === 'c8' ? 'c8' : 'nyc';
	const reportFlag = tool === 'c8' ? `--reports-dir=${reportDir}` : `--report-dir=${reportDir}`;
	const run =
		packageManager === 'pnpm'
			? (['pnpm', 'run', testScript] as const)
			: packageManager === 'yarn'
				? (['yarn', 'run', testScript] as const)
				: (['npm', 'run', testScript] as const);
	return {
		command: exec.command,
		args: [...exec.prefix, wrapBin, '--reporter=json-summary', '--reporter=text-summary', reportFlag, ...run],
	};
};
