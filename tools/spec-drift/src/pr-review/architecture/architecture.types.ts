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
	 * The kit's built-in security pack on the PR files (pr-security-baseline REQ-001 + dashboard-ux REQ-008).
	 * Always present on Semgrep when the PR has scannable files. Kept apart from `findings` so import indices stay stable.
	 */
	readonly builtinSecurity?: BuiltinSecurityScan;
	/**
	 * The repository's own security rule set (e.g. `.semgrep/security/`) on the PR files, or `missing` with a
	 * generatePrompt when that set is absent (pr-review-dashboard-ux REQ-005…007).
	 */
	readonly repoSecurity?: RepoSecurityScan;
};

/** Result of the built-in security pack in a PR scan; `error` is a note, never a blocker (REQ-003). */
export type BuiltinSecurityScan = {
	readonly status: 'scanned' | 'error';
	readonly packId: string;
	readonly findingCount: number;
	readonly findings: readonly ArchitectureFinding[];
	readonly message: string;
};

/** Repository security set scan for the Security Findings tab (REQ-006 / REQ-007). */
export type RepoSecurityScan = {
	readonly status: 'scanned' | 'missing' | 'error';
	readonly findingCount: number;
	readonly findings: readonly ArchitectureFinding[];
	/** Rule files relative to the security set folder (when present). */
	readonly configFiles: readonly string[];
	readonly message: string;
	/** When status is missing — send to the host agent to draft `.semgrep/security/` rules. */
	readonly generatePrompt?: string;
};
