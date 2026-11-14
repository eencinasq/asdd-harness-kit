import type { Finding, RuleMeta, Severity } from '../../analysis.types.ts';

/**
 * CodeQL query metadata and SARIF results as the engine-neutral model (spec-drift-demand REQ-005). Pure.
 */

export const QUERY_EXT = /\.(ql|qls)$/;

const SEVERITY: Record<string, Severity> = { error: 'ERROR', warning: 'WARNING', recommendation: 'INFO', note: 'INFO' };

/** The `@key value` tags of a query's leading QLDoc comment. */
const qldoc = (source: string): Map<string, string> => {
	const header = /\/\*\*([\s\S]*?)\*\//.exec(source)?.[1] ?? '';
	const tags = new Map<string, string>();
	let key: string | null = null;
	for (const raw of header.split('\n')) {
		const line = raw.replace(/^\s*\*\s?/, '').trim();
		const m = /^@([\w.-]+)\s*(.*)$/.exec(line);
		if (m) {
			key = m[1] as string;
			tags.set(key, (m[2] ?? '').trim());
		} else if (key && line) {
			tags.set(key, `${tags.get(key)} ${line}`.trim());
		}
	}
	return tags;
};

/** A `.ql` query as a rule: `@id`, `@name`, `@problem.severity`, ADR from an `adr:ADR-0007` tag or `@adr`. */
export const parseQuery = (source: string, pack: string, set: string): RuleMeta | null => {
	const tags = qldoc(source);
	const id = tags.get('id');
	if (!id) return null;
	const tagList = (tags.get('tags') ?? '').split(/\s+/).filter(Boolean);
	const adr = tags.get('adr') || tagList.find((t) => /^adr:/i.test(t))?.slice(4) || null;
	return {
		id,
		severity: SEVERITY[(tags.get('problem.severity') ?? tags.get('severity') ?? 'warning').toLowerCase()] ?? 'WARNING',
		message: tags.get('name') ?? tags.get('description') ?? id,
		category: tagList.find((t) => !/^adr:/i.test(t)) ?? (set || 'codeql'),
		adr,
		pack,
		mode: tags.get('kind') ?? 'problem',
	};
};

type SarifResult = {
	ruleId?: string;
	rule?: { id?: string };
	level?: string;
	message?: { text?: string };
	locations?: {
		physicalLocation?: { artifactLocation?: { uri?: string }; region?: { startLine?: number; endLine?: number } };
	}[];
};

/** SARIF results as findings attributed to the declared rules; results of undeclared queries are dropped. */
export const sarifFindings = (sarif: unknown, rules: readonly RuleMeta[]): Finding[] => {
	const byId = new Map(rules.map((r) => [r.id, r]));
	const runs = (sarif as { runs?: { results?: SarifResult[] }[] } | null)?.runs ?? [];
	return runs.flatMap((run) =>
		(run.results ?? []).flatMap((r): Finding[] => {
			const rule = byId.get(r.ruleId ?? r.rule?.id ?? '');
			const location = r.locations?.[0]?.physicalLocation;
			const file = location?.artifactLocation?.uri?.replace(/^file:\/\//, '').replace(/^\.\//, '');
			if (!rule || !file) return [];
			const startLine = location?.region?.startLine ?? 1;
			return [
				{
					checkId: rule.id,
					path: file,
					startLine,
					endLine: location?.region?.endLine ?? startLine,
					severity: rule.severity,
					message: r.message?.text ?? rule.message,
					category: rule.category,
					adr: rule.adr,
					pack: rule.pack,
				},
			];
		}),
	);
};

const LANGUAGES: readonly [string, RegExp][] = [
	['javascript-typescript', /\.(m|c)?[jt]sx?$/],
	['python', /\.py$/],
	['java-kotlin', /\.(java|kt)$/],
	['go', /\.go$/],
	['csharp', /\.cs$/],
	['ruby', /\.rb$/],
	['cpp', /\.(c|cc|cpp|h|hpp)$/],
];

/** The CodeQL extractor for the repository's most common source language; null when none is recognized. */
export const detectLanguage = (files: readonly string[]): string | null => {
	let best: [string, number] | null = null;
	for (const [language, re] of LANGUAGES) {
		const n = files.filter((f) => re.test(f)).length;
		if (n > 0 && (!best || n > best[1])) best = [language, n];
	}
	return best?.[0] ?? null;
};
