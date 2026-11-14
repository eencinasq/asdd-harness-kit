import { matchGlob } from '../engine/glob.ts';

/**
 * PR risk (spec-drift-depth REQ-002): where to read first. The score is the `asdd audit` hotspot formula
 * (churn + 2 × requirement links + 5 × findings) applied to the PR's changed files. Advisory only (ADR-005): group order
 * and coverage do not change. Pure: the sources are read by the service.
 */

export type RiskLevel = 'high' | 'medium' | 'low';

export type FileRisk = {
	readonly path: string;
	readonly score: number;
	readonly level: RiskLevel;
	/** Commits that touched the file in the last CHURN_WINDOW. */
	readonly churn: number;
	/** Requirement ids of the features whose scope covers the file. */
	readonly reqLinks: number;
	/** This PR's architecture findings plus the latest audit report's findings on the file. */
	readonly findings: number;
	/** Rank in the latest audit report's hotspots (1 = first), when listed there. */
	readonly hotspot: number | null;
	readonly reasons: readonly string[];
};

export type RiskSource = 'churn' | 'requirements' | 'architecture' | 'audit';

export type PrRisk = {
	readonly files: readonly FileRisk[];
	/** Sources that could not be read (they count 0). */
	readonly unavailable: readonly RiskSource[];
	readonly formula: string;
};

export type RiskFeature = {
	readonly id: string;
	readonly scope_paths?: readonly string[];
	readonly req_ids?: readonly string[];
};

export const CHURN_WINDOW = '90.days';
export const HIGH_SCORE = 10;
export const MEDIUM_SCORE = 4;
/** Files named in the review prompt as "read first". */
export const READ_FIRST = 5;
export const FORMULA = 'score = churn (commits in 90 days) + 2 × requirement links + 5 × findings';

/** A feature scope path covers a file: the same path, a folder above it, or a matching glob. */
export const scopeCovers = (scope: string, file: string): boolean => {
	const s = scope.replace(/^\.\//, '').replace(/\/+$/, '');
	if (!s) return false;
	if (/[*?{]/.test(s)) return matchGlob(s, file);
	return file === s || file.startsWith(`${s}/`);
};

export const levelOf = (score: number, findings: number): RiskLevel =>
	findings > 0 || score >= HIGH_SCORE ? 'high' : score >= MEDIUM_SCORE ? 'medium' : 'low';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const rankRisk = (input: {
	readonly files: readonly string[];
	/** Commits per file; undefined when git history could not be read. */
	readonly churn?: ReadonlyMap<string, number>;
	/** The repository's features; undefined without `.harness/features/`. */
	readonly features?: readonly RiskFeature[];
	/** Architecture findings of this PR; undefined when the scan did not run. */
	readonly architectureFindings?: readonly { readonly path: string }[];
	/** The latest audit report; undefined without `.harness/audits/`. */
	readonly audit?: {
		readonly findings: readonly { readonly paths?: readonly string[]; readonly check?: string }[];
		readonly hotspots: readonly { readonly path: string }[];
	};
}): PrRisk => {
	const unavailable: RiskSource[] = [];
	if (!input.churn) unavailable.push('churn');
	if (!input.features) unavailable.push('requirements');
	if (!input.architectureFindings) unavailable.push('architecture');
	if (!input.audit) unavailable.push('audit');

	const files = [...new Set(input.files)].map((file): FileRisk => {
		const churn = input.churn?.get(file) ?? 0;
		const covering = (input.features ?? []).filter((f) => (f.scope_paths ?? []).some((s) => scopeCovers(s, file)));
		const reqLinks = covering.reduce((n, f) => n + (f.req_ids?.length ?? 0), 0);
		const archHits = (input.architectureFindings ?? []).filter((f) => f.path === file).length;
		// UNOWNED is about missing ownership, not about the code (the audit's own hotspots skip it too).
		const auditHits = (input.audit?.findings ?? []).filter(
			(f) => f.check !== 'UNOWNED' && (f.paths ?? []).includes(file),
		).length;
		const findings = archHits + auditHits;
		const rank = (input.audit?.hotspots ?? []).findIndex((h) => h.path === file);
		const score = churn + 2 * reqLinks + 5 * findings;
		const reasons = [
			churn ? `${plural(churn, 'commit')} in 90 days` : '',
			reqLinks ? `${plural(reqLinks, 'requirement link')} (${covering.map((f) => f.id).join(', ')})` : '',
			archHits ? `${plural(archHits, 'architecture finding')} in this PR` : '',
			auditHits ? `${plural(auditHits, 'finding')} in the latest audit` : '',
			rank >= 0 ? `audit hotspot #${rank + 1}` : '',
		].filter(Boolean);
		return {
			path: file,
			score,
			level: levelOf(score, findings),
			churn,
			reqLinks,
			findings,
			hotspot: rank >= 0 ? rank + 1 : null,
			reasons,
		};
	});
	files.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
	return { files, unavailable, formula: FORMULA };
};

/** Files worth reading first: the top ones with a score, high and medium before low. */
export const readFirst = (risk: PrRisk, max = READ_FIRST): FileRisk[] =>
	risk.files.filter((f) => f.score > 0).slice(0, max);

/** The "Read first" section of the review prompt; empty when no file has a signal. */
export const riskPromptSection = (risk: PrRisk): string => {
	const top = readFirst(risk);
	if (!top.length) return '';
	return [
		'## Read first (risk)',
		'',
		`Changed files ranked by risk (${risk.formula}). Review these with the most care; the group order does not change.`,
		'',
		...top.map((f) => `- \`${f.path}\` — ${f.level}, score ${f.score}: ${f.reasons.join('; ')}`),
		...(risk.unavailable.length ? ['', `Not available for this repository: ${risk.unavailable.join(', ')}.`] : []),
		'',
	].join('\n');
};

/** Parses `git log --format= --name-only` into commits per file. */
export const churnFromLog = (log: string): Map<string, number> => {
	const churn = new Map<string, number>();
	for (const line of log.split('\n')) {
		const file = line.trim();
		if (file) churn.set(file, (churn.get(file) ?? 0) + 1);
	}
	return churn;
};
