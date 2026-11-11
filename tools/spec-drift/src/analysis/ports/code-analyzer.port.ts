import type { EngineInfo, Finding, RuleMeta, RulePack } from '../analysis.types.ts';

/**
 * Port between the analysis use cases (spec drift, PR architecture scan) and a static-analysis
 * engine. Semgrep is the default adapter (engines/semgrep); a CodeQL adapter would implement the
 * the same methods and be wired with `AnalysisModule.forRoot({ engine: CodeqlEngineModule })`.
 *
 * Contract every adapter must honor (see analysis.service.spec.ts):
 *  - paths are relative to `repoRoot` and are passed to the tool after `--` (never as options);
 *  - `run` resolves even when the tool reports violations; it rejects only when the tool cannot be
 *    started (e.g. not installed) and returns `status: 'failed'` when it ran but produced no result;
 *  - findings carry the rule id as declared in `rules` (not tool-specific prefixes).
 */
export interface CodeAnalyzer {
	readonly engine: EngineInfo;

	/** Where the rules live in `repoRoot`, and which rule files exist (relative to that folder). */
	inspect(repoRoot: string): Promise<RulesLocation>;

	/** Packs under the rules folder: one per top-level folder (set), one per rule file. */
	listPacks(repoRoot: string): Promise<RulePack[]>;

	/** Rules declared by the given packs. */
	loadRules(packs: readonly RulePack[]): Promise<RuleMeta[]>;

	run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult>;

	/** Engine-specific steps for an agent asked to write a first rule set for a repo. */
	authoringGuide(): readonly string[];
}

export type RulesLocation = {
	/** Absolute path of the rules folder (it may not exist). */
	readonly rulesDir: string;
	readonly exists: boolean;
	/** Rule files relative to `rulesDir`. */
	readonly ruleFiles: readonly string[];
};

export type AnalyzerRunRequest = {
	readonly repoRoot: string;
	readonly packs: readonly RulePack[];
	/** Catalog for `packs`, used to map engine rule ids back to declared ids. */
	readonly rules: readonly RuleMeta[];
	/** Relative paths to scan; the whole repo when empty. */
	readonly paths?: readonly string[];
	/**
	 * Folder the `paths` are read from, when it is not `repoRoot` (e.g. a snapshot of a PR's files).
	 * Rules always come from `packs`, so the scanned code cannot change them.
	 */
	readonly targetRoot?: string;
	/** Folders to skip (relative). */
	readonly exclude?: readonly string[];
	/** Whole-run timeout. */
	readonly timeoutMs: number;
};

export type AnalyzerRunResult = {
	readonly status: 'ok' | 'failed';
	readonly exitCode: number;
	readonly findings: readonly Finding[];
	readonly stderrTail: string;
};

/** Injection token for the active engine. */
export const CODE_ANALYZER = Symbol('CODE_ANALYZER');
