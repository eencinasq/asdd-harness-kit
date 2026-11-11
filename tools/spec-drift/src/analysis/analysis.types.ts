/**
 * Engine-neutral analysis model. Every analyzer (Semgrep today, CodeQL or others tomorrow) maps its
 * own output onto these types, so drift reports, tools and dashboards never depend on one tool.
 */

export const SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type ScanMode = 'architecture' | 'standards' | 'all' | 'spec-drift';

/** The analyzer behind a scan, shown in tool output and dashboards. */
export type EngineInfo = {
	/** Stable id, e.g. `semgrep`, `codeql`. */
	readonly id: string;
	/** Display name, e.g. `Semgrep`. */
	readonly name: string;
	/** Folder that holds the rules inside a repo, e.g. `.semgrep`. */
	readonly rulesDir: string;
};

/**
 * A group of rules the engine can run:
 *  - `set`: a top-level folder of rules (e.g. `architecture/`, `standards/`);
 *  - `file`: one rule file / query suite inside a set (or directly in the rules dir).
 */
export type RulePack = {
	readonly id: string;
	readonly kind: 'set' | 'file';
	/** Absolute path of the folder or file handed to the engine. */
	readonly path: string;
	/** Set the pack belongs to (its own id for a set; '' for files directly in the rules dir). */
	readonly set: string;
	/** Rule files (absolute) the pack covers. */
	readonly files: readonly string[];
};

/** One rule declared in a pack: the "spec" findings are compared against. */
export type RuleMeta = {
	readonly id: string;
	readonly severity: Severity;
	readonly message: string;
	readonly category: string;
	readonly adr: string | null;
	readonly pack: string;
	/** Engine-specific rule kind (`search`, `taint`, `path-problem`, …). */
	readonly mode: string;
};

/** One violation, attributed to the rule (and pack) that declares it. */
export type Finding = {
	readonly checkId: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly severity: Severity;
	readonly message: string;
	readonly category: string;
	readonly adr: string | null;
	readonly pack: string;
};

export type SpecDriftItem = {
	readonly ruleId: string;
	readonly severity: Severity;
	readonly category: string;
	readonly adr: string | null;
	readonly message: string;
	readonly pack: string;
	readonly violationCount: number;
	readonly status: 'clean' | 'drifting' | 'unscanned';
	readonly samplePaths: readonly string[];
};

export type SpecDriftReport = {
	readonly totalRules: number;
	readonly cleanRules: number;
	readonly driftingRules: number;
	readonly items: readonly SpecDriftItem[];
	readonly topDrifts: readonly SpecDriftItem[];
};

/** One row in the Pack | Result table (Boundaries / Network / Scaffolding+taint / …). */
export type PackSummary = {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly status: 'clean' | 'findings';
	readonly findingCount: number;
	readonly bySeverity: Readonly<Record<string, number>>;
	/** e.g. "Clean" or "79 findings: 41 error, 38 warning" */
	readonly resultLabel: string;
};

export type ScanSummary = {
	readonly engine: EngineInfo;
	readonly scannedAt: string;
	readonly repoRoot: string;
	readonly mode: ScanMode;
	readonly packs: readonly string[];
	/** `failed`: the engine did not produce a result (crash, bad config); see stderrTail. */
	readonly status: 'ok' | 'failed';
	readonly exitCode: number;
	readonly findingCount: number;
	readonly bySeverity: Readonly<Record<string, number>>;
	readonly byPack: Readonly<Record<string, number>>;
	readonly byRule: Readonly<Record<string, number>>;
	readonly findings: readonly Finding[];
	readonly rules: readonly RuleMeta[];
	readonly drift: SpecDriftReport;
	readonly packSummaries: readonly PackSummary[];
	readonly stderrTail: string;
};
