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
	/**
	 * The kit's built-in security pack on the PR files (pr-security-baseline REQ-001), when the repo has no `security`
	 * rule set and the engine is Semgrep. Kept apart from `findings` so `pr_review_import_architecture` indices stay stable.
	 */
	readonly builtinSecurity?: BuiltinSecurityScan;
};

/** Result of the built-in security pack in a PR scan; `error` is a note, never a blocker (REQ-003). */
export type BuiltinSecurityScan = {
	readonly status: 'scanned' | 'error';
	readonly packId: string;
	readonly findingCount: number;
	readonly findings: readonly ArchitectureFinding[];
	readonly message: string;
};
