import type { EngineInfo } from '../../analysis/analysis.types.ts';

export type ArchitectureFinding = {
	readonly checkId: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly severity: string;
	readonly message: string;
};

export type ArchitectureReviewView = {
	readonly status: 'scanned' | 'missing-config' | 'error' | 'empty-config';
	/** Analyzer that ran (absent in reviews saved before engines were pluggable: Semgrep). */
	readonly engine?: EngineInfo;
	/** Absolute rules folder in the reviewed repo, e.g. `<repo>/.semgrep`. */
	readonly rulesDir: string;
	/** Rule files relative to rulesDir. */
	readonly configFiles: readonly string[];
	readonly findingCount: number;
	readonly findings: readonly ArchitectureFinding[];
	readonly scannedPaths: readonly string[];
	readonly message: string;
	/** When status is missing-config / empty-config — send to the host agent. */
	readonly generatePrompt?: string;
	readonly stderrTail?: string;
};
