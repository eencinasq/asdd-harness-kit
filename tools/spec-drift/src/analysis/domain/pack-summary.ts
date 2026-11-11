import type { Finding, PackSummary } from '../analysis.types.ts';

/**
 * Optional curated labels for well-known pack ids (the mi-local-core-features layout). Any other
 * pack gets a generic title from its id. Pure: shared with the dashboard UI.
 */
const PACK_LABELS: Readonly<Record<string, { readonly title: string; readonly description: string }>> = {
	boundaries: { title: 'Boundaries', description: 'no infra in domain, no foreign context, no sibling app' },
	'network-database': {
		title: 'Network and database',
		description: 'no ORM or fetch in domain, HTTP via createHttpClient, no Kafka consumer in notifications',
	},
	scaffolding: {
		title: 'Scaffolding',
		description: 'bootstrapApp, @Authorize, appId from JWT, Zod namespace import',
	},
	taint: { title: 'Taint', description: 'request → broker / logger / SQL' },
	'coding-standards': {
		title: 'Coding standards',
		description: 'no try/catch, enum, any, non-null assertions; process.env via EnvSchema',
	},
};

/** `network-database` → `Network database`. */
const titleOf = (id: string): string => {
	const words = id.replace(/[-_.]+/g, ' ').trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
};

const severityLabel = (severity: string, count: number): string => `${count} ${severity.toLowerCase()}`;

export const formatPackResult = (findingCount: number, bySeverity: Readonly<Record<string, number>>): string => {
	if (findingCount === 0) return 'Clean';
	const parts = (['ERROR', 'WARNING', 'INFO'] as const)
		.filter((s) => (bySeverity[s] ?? 0) > 0)
		.map((s) => severityLabel(s, bySeverity[s] ?? 0));
	const detail = parts.length > 0 ? parts.join(', ') : String(findingCount);
	return `${findingCount} finding${findingCount === 1 ? '' : 's'}: ${detail}`;
};

/**
 * One row per rule-file pack in the scan (`ruleCounts`: pack id → number of rules), with the
 * findings attributed to it. Packs with findings but no catalog entry still get a row.
 */
export const buildPackSummaries = (
	findings: readonly Finding[],
	ruleCounts: Readonly<Record<string, number>>,
): PackSummary[] => {
	const ids = [...new Set([...Object.keys(ruleCounts), ...findings.map((f) => f.pack)])].filter(
		(id) => id !== 'unknown',
	);
	return ids.sort().map((id) => {
		const packFindings = findings.filter((f) => f.pack === id);
		const bySeverity: Record<string, number> = {};
		for (const finding of packFindings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
		const rules = ruleCounts[id] ?? 0;
		const label = PACK_LABELS[id];
		return {
			id,
			title: label?.title ?? titleOf(id),
			description: label?.description ?? `${rules} rule${rules === 1 ? '' : 's'}`,
			status: packFindings.length === 0 ? 'clean' : 'findings',
			findingCount: packFindings.length,
			bySeverity,
			resultLabel: formatPackResult(packFindings.length, bySeverity),
		};
	});
};
