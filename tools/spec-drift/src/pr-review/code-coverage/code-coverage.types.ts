/** Istanbul-style code coverage for the PR Review dashboard (pr-review-dashboard-ux REQ-014…016). */

export type CoverageTool = 'vitest' | 'jest' | 'c8' | 'nyc';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export type CoverageTotals = {
	readonly linesPct: number;
	readonly statementsPct: number;
	readonly functionsPct: number;
	readonly branchesPct: number;
	readonly linesCovered: number;
	readonly linesTotal: number;
};

export type CoverageFileRow = {
	readonly path: string;
	readonly linesPct: number;
	readonly linesCovered: number;
	readonly linesTotal: number;
};

/** Detected JS/TS unit-test + coverage setup in the reviewed repo. */
export type JsCoverageSetup = {
	readonly tool: CoverageTool;
	readonly packageManager: PackageManager;
	readonly testScript: string;
};

export type CodeCoverageView = {
	readonly status: 'scanned' | 'missing' | 'error';
	readonly tool?: CoverageTool;
	readonly packageManager?: PackageManager;
	readonly totals?: CoverageTotals;
	/** PR-path rows (subset of the Istanbul report) when paths matched. */
	readonly files: readonly CoverageFileRow[];
	readonly message: string;
	/** When status is missing — send to the host agent to add tests + coverage. */
	readonly generatePrompt?: string;
	readonly stderrTail?: string;
	/** Command that was run (when scanned or error after a run). */
	readonly command?: string;
};
