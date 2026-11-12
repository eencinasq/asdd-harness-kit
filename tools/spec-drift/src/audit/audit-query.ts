import type { AuditFinding } from './audit.types.ts';

/**
 * Server-side filter and group over audit findings (spec-drift-apps REQ-004): the aggregation a code-mode host would do
 * in its sandbox, done here so every host gets counts and a bounded sample instead of every page of findings.
 */

export const GROUP_BY = ['slice', 'severity', 'check', 'path', 'none'] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export type QueryFilters = {
	readonly slice_id?: string;
	readonly severity?: string;
	readonly check?: string;
	readonly source?: string;
	readonly path_prefix?: string;
};

export type QueryResult = {
	readonly total: number;
	readonly matched: number;
	readonly group_by: GroupBy;
	readonly groups: { key: string; count: number; by_severity: Record<string, number> }[];
	readonly findings: AuditFinding[];
	readonly truncated: boolean;
};

const PATHS_PER_FINDING = 5;
const NO_VALUE = '(none)';

/** Top-level directory of a path (`src/a/b.ts` → `src`), the path itself at the root. */
const pathKey = (p: string): string => (p.includes('/') ? p.slice(0, p.indexOf('/')) : p);

const keysOf = (f: AuditFinding, groupBy: GroupBy): string[] => {
	switch (groupBy) {
		case 'slice':
			return [f.slice_id ?? NO_VALUE];
		case 'severity':
			return [String(f.severity)];
		case 'check':
			return [f.check];
		case 'path': {
			const keys = [...new Set((f.paths ?? []).map(pathKey))];
			return keys.length ? keys : [NO_VALUE];
		}
		default:
			return ['all'];
	}
};

const matches = (f: AuditFinding, q: QueryFilters): boolean =>
	(!q.slice_id || f.slice_id === q.slice_id) &&
	(!q.severity || f.severity === q.severity) &&
	(!q.check || f.check === q.check) &&
	(!q.source || (f.source ?? 'computational') === q.source) &&
	(!q.path_prefix || (f.paths ?? []).some((p) => p === q.path_prefix || p.startsWith(q.path_prefix as string)));

const trim = (f: AuditFinding): AuditFinding =>
	f.paths && f.paths.length > PATHS_PER_FINDING
		? { ...f, paths: f.paths.slice(0, PATHS_PER_FINDING), paths_total: f.paths.length }
		: f;

export function queryFindings(
	findings: readonly AuditFinding[],
	filters: QueryFilters,
	groupBy: GroupBy = 'none',
	limit = 20,
): QueryResult {
	const hit = findings.filter((f) => matches(f, filters));
	const groups = new Map<string, { count: number; by_severity: Record<string, number> }>();
	for (const f of hit) {
		for (const key of keysOf(f, groupBy)) {
			const g = groups.get(key) ?? { count: 0, by_severity: {} };
			g.count += 1;
			g.by_severity[String(f.severity)] = (g.by_severity[String(f.severity)] ?? 0) + 1;
			groups.set(key, g);
		}
	}
	return {
		total: findings.length,
		matched: hit.length,
		group_by: groupBy,
		groups: [...groups]
			.map(([key, g]) => ({ key, ...g }))
			.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
		findings: hit.slice(0, Math.max(0, limit)).map(trim),
		truncated: hit.length > limit,
	};
}
