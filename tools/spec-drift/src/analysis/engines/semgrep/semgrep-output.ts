import type { Finding, RuleMeta, RuleTestReport } from '../../analysis.types.ts';
import { adrOf, toSeverity } from './semgrep-rules.ts';

/** Subset of `semgrep --json` output this adapter reads. */
export type RawSemgrepJson = {
	readonly results?: readonly {
		readonly check_id?: string;
		readonly path?: string;
		readonly start?: { readonly line?: number };
		readonly end?: { readonly line?: number };
		readonly extra?: {
			readonly severity?: string;
			readonly message?: string;
			readonly metadata?: unknown;
		};
	}[];
	readonly errors?: readonly { readonly type?: unknown; readonly message?: unknown; readonly path?: unknown }[];
};

/** Parse `semgrep --json` stdout; empty or invalid output yields `undefined`. */
export const parseSemgrepJson = (stdout: string): RawSemgrepJson | undefined => {
	try {
		const parsed: unknown = JSON.parse(stdout);
		return parsed && typeof parsed === 'object' ? (parsed as RawSemgrepJson) : undefined;
	} catch {
		return undefined;
	}
};

/**
 * Semgrep prefixes rule ids with the config path (`.semgrep/architecture/x.yml` → `semgrep.architecture.<id>`).
 * Map a check id back to the id declared in the catalog (longest suffix match); unknown ids stay as-is.
 */
export const normalizeCheckId = (checkId: string, catalog: readonly Pick<RuleMeta, 'id'>[]): string => {
	let best: string | undefined;
	for (const { id } of catalog) {
		if ((checkId === id || checkId.endsWith(`.${id}`)) && id.length > (best?.length ?? 0)) best = id;
	}
	return best ?? checkId;
};

const categoryOf = (metadata: unknown): string | undefined => {
	if (metadata && typeof metadata === 'object' && 'category' in metadata) {
		const value = (metadata as { category?: unknown }).category;
		if (typeof value === 'string') return value;
	}
	return undefined;
};

/** Findings with rule ids, packs and categories resolved against the rule catalog. */
export const parseFindings = (raw: RawSemgrepJson | undefined, catalog: readonly RuleMeta[]): Finding[] => {
	const byId = new Map(catalog.map((r) => [r.id, r]));
	return (raw?.results ?? []).map((result) => {
		const checkId = normalizeCheckId(result.check_id ?? 'unknown', catalog);
		const rule = byId.get(checkId);
		return {
			checkId,
			path: result.path ?? '',
			startLine: result.start?.line ?? 0,
			endLine: result.end?.line ?? 0,
			severity: toSeverity(result.extra?.severity, rule?.severity ?? 'INFO'),
			message: result.extra?.message ?? '',
			category: categoryOf(result.extra?.metadata) ?? rule?.category ?? 'unknown',
			adr: adrOf(result.extra?.metadata) ?? rule?.adr ?? null,
			pack: rule?.pack ?? 'unknown',
		};
	});
};

/** One line per Semgrep error (`--quiet` moves them from stderr into the JSON). */
export const semgrepErrors = (raw: RawSemgrepJson | undefined): string =>
	(raw?.errors ?? [])
		.slice(0, 10)
		.map((e) => {
			const type = Array.isArray(e.type) ? e.type[0] : e.type;
			const where = typeof e.path === 'string' ? ` (${e.path})` : '';
			const message = typeof e.message === 'string' ? e.message.split('\n')[0] : '';
			return `${typeof type === 'string' ? type : 'Error'}${where}: ${message}`.trim();
		})
		.join('\n');

/** `semgrep --test --json` output → per-rule pass/fail and the rule files with errors (rule-coverage REQ-004). */
export const parseTestOutput = (stdout: string): Omit<RuleTestReport, 'status' | 'message'> | undefined => {
	let raw: unknown;
	try {
		raw = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!raw || typeof raw !== 'object') return undefined;
	const json = raw as {
		results?: Record<string, { checks?: Record<string, { passed?: boolean }> }>;
		config_with_errors?: unknown[];
	};
	const byRule: Record<string, 'passed' | 'failed'> = {};
	for (const file of Object.values(json.results ?? {})) {
		for (const [id, check] of Object.entries(file.checks ?? {})) byRule[id] = check.passed ? 'passed' : 'failed';
	}
	const invalidFiles = (json.config_with_errors ?? []).map((e) =>
		typeof e === 'string'
			? e
			: String((e as { file?: string; path?: string }).file ?? (e as { path?: string }).path ?? e),
	);
	return { byRule, invalidFiles };
};
