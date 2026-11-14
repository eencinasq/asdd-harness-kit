import { buildTrend, type Direction, type Snapshot, snapshotPoint } from './trend.ts';

/**
 * Multi-repository overview (spec-drift-demand REQ-006, ADR-006): per repository, its latest analysis snapshot, the trend
 * over its snapshots, and its latest audit report. Pure: the service reads the files, runs no scan.
 */

export type RepoData = {
	readonly name: string;
	readonly root: string;
	/** Snapshots oldest first, with their file names. */
	readonly snapshots: readonly { readonly file: string; readonly snapshot: Snapshot }[];
	readonly audit: {
		readonly file: string;
		readonly report: {
			readonly generated_at?: string;
			readonly findings?: readonly unknown[];
			readonly summary?: { readonly drift_level?: string; readonly spec_compliance?: number | null };
		};
	} | null;
	/** Set when the folder is missing or unreadable. */
	readonly error?: string;
};

export type RepoSummary = {
	readonly name: string;
	readonly root: string;
	readonly analysis: {
		readonly recordedAt: string;
		readonly commit: string | null;
		readonly total: number;
		readonly new: number | null;
		readonly snapshots: number;
		readonly direction: Direction;
		readonly change: number | null;
	} | null;
	readonly audit: {
		readonly generatedAt: string | null;
		readonly driftLevel: string | null;
		readonly specCompliance: number | null;
		readonly findings: number;
	} | null;
	readonly noData: boolean;
	readonly error?: string;
};

export const summarizeRepo = (repo: RepoData): RepoSummary => {
	const last = repo.snapshots.at(-1);
	const trend = buildTrend(repo.snapshots.map(({ file, snapshot }) => snapshotPoint(file, snapshot, 'rule')));
	const analysis = last
		? {
				recordedAt: last.snapshot.recorded_at,
				commit: last.snapshot.commit ?? null,
				total: last.snapshot.total,
				new: last.snapshot.new,
				snapshots: repo.snapshots.length,
				direction: trend.direction,
				change: trend.change,
			}
		: null;
	const r = repo.audit?.report;
	const audit = r
		? {
				generatedAt: r.generated_at ?? null,
				driftLevel: r.summary?.drift_level ?? null,
				specCompliance: r.summary?.spec_compliance ?? null,
				findings: r.findings?.length ?? 0,
			}
		: null;
	return {
		name: repo.name,
		root: repo.root,
		analysis,
		audit,
		noData: !analysis && !audit,
		...(repo.error ? { error: repo.error } : {}),
	};
};

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

export const overviewText = (repos: readonly RepoSummary[]): string =>
	[
		`${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}:`,
		...repos.map((r) => {
			if (r.error) return `- ${r.name}: ${r.error}`;
			if (r.noData) return `- ${r.name}: no data (run \`spec-drift record\` and \`asdd audit\` there)`;
			const a = r.analysis
				? `${r.analysis.total} findings${r.analysis.new !== null ? ` (${r.analysis.new} new)` : ''}, ${r.analysis.direction}${r.analysis.change !== null ? ` ${Math.round(r.analysis.change * 100)}%` : ''} over ${r.analysis.snapshots} snapshot(s)`
				: 'no snapshots';
			const au = r.audit
				? `audit ${r.audit.driftLevel ?? '—'}, spec compliance ${pct(r.audit.specCompliance)}`
				: 'no audit';
			return `- ${r.name}: ${a}; ${au}`;
		}),
	].join('\n');
