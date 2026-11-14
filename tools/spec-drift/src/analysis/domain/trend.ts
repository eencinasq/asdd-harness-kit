/**
 * Drift over time (spec-drift-adoption REQ-002): dated analysis snapshots (`.semgrep/history/<date>.json`, written by
 * `spec-drift record`) or the kit's audit reports (`.harness/audits/<timestamp>.json`), as points; the change of each
 * rule / ADR / pack / check / slice between the first and the last point; and whether drift went up or down. Pure.
 */

/** Inside the rules folder: one snapshot per day (`2026-11-12.json`). */
export const HISTORY_DIR = 'history';

/** ±this share of the first value is "flat" (design ADR-004). */
export const FLAT_RATIO = 0.05;

export type Snapshot = {
	readonly schema_version: '1.0';
	readonly recorded_at: string;
	readonly commit: string | null;
	readonly engine: string;
	readonly total: number;
	/** New findings against the baseline; null when the repo had none. */
	readonly new: number | null;
	readonly by_severity: Readonly<Record<string, number>>;
	readonly by_rule: Readonly<Record<string, number>>;
	readonly by_adr: Readonly<Record<string, number>>;
	readonly by_pack: Readonly<Record<string, number>>;
	readonly rules: number;
	/** ADR coverage ratio at that time; null without ADRs. */
	readonly adr_coverage: number | null;
};

/** One point of a trend: a snapshot or an audit report, reduced to what the trend compares. */
export type TrendPoint = {
	readonly at: string;
	readonly label: string;
	readonly total: number;
	readonly new: number | null;
	readonly groups: Readonly<Record<string, number>>;
};

export type Direction = 'better' | 'worse' | 'flat' | 'unknown';

export type Trend = {
	readonly points: readonly Omit<TrendPoint, 'groups'>[];
	/** What the direction compares: new findings when every point has a baseline, else all findings. */
	readonly measure: 'new' | 'total';
	readonly direction: Direction;
	/** Change of the measure between the first and the last point, as a share of the first (null without two points). */
	readonly change: number | null;
	/** Per key (rule, ADR, check…), first → last, the largest moves first. */
	readonly changes: readonly {
		readonly key: string;
		readonly first: number;
		readonly last: number;
		readonly delta: number;
	}[];
};

export const directionOf = (first: number, last: number): { direction: Direction; change: number } => {
	const change = first === 0 ? (last === 0 ? 0 : 1) : (last - first) / first;
	if (Math.abs(change) <= FLAT_RATIO) return { direction: 'flat', change };
	return { direction: change < 0 ? 'better' : 'worse', change };
};

export const buildTrend = (input: readonly TrendPoint[], limit = 30, changesLimit = 15): Trend => {
	const points = [...input].sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
	const measure = points.length > 0 && points.every((p) => p.new !== null) ? 'new' : 'total';
	const value = (p: TrendPoint) => (measure === 'new' ? (p.new as number) : p.total);
	const first = points[0];
	const last = points.at(-1);
	const moved =
		first && last && points.length > 1
			? [...new Set([...Object.keys(first.groups), ...Object.keys(last.groups)])]
					.map((key) => {
						const a = first.groups[key] ?? 0;
						const b = last.groups[key] ?? 0;
						return { key, first: a, last: b, delta: b - a };
					})
					.filter((c) => c.delta !== 0)
					.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.key.localeCompare(y.key))
					.slice(0, changesLimit)
			: [];
	const dir = first && last && points.length > 1 ? directionOf(value(first), value(last)) : null;
	return {
		points: points.map(({ groups: _groups, ...p }) => p),
		measure,
		direction: dir?.direction ?? 'unknown',
		change: dir?.change ?? null,
		changes: moved,
	};
};

/** Count findings per key. */
export const countKeys = <T>(
	items: readonly T[],
	key: (item: T) => string | null | undefined,
): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const item of items) {
		const k = key(item) || '(none)';
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
};

/** An audit report (`.harness/audits/<timestamp>.json`) as a trend point, grouped by check or slice. */
export const auditPoint = (
	file: string,
	report: { readonly generated_at?: string; readonly findings?: readonly Record<string, unknown>[] },
	by: 'check' | 'slice' | 'severity',
): TrendPoint | null => {
	if (!report?.generated_at || !Array.isArray(report.findings)) return null;
	const field = by === 'slice' ? 'slice_id' : by;
	return {
		at: String(report.generated_at),
		label: file,
		total: report.findings.length,
		new: null,
		groups: countKeys(report.findings, (f) => (f[field] === undefined || f[field] === null ? null : String(f[field]))),
	};
};

/** A snapshot as a trend point, grouped by rule, ADR, pack, or severity. */
export const snapshotPoint = (file: string, s: Snapshot, by: 'rule' | 'adr' | 'pack' | 'severity'): TrendPoint => ({
	at: s.recorded_at,
	label: s.commit ? `${file} (${s.commit.slice(0, 7)})` : file,
	total: s.total,
	new: s.new,
	groups: by === 'adr' ? s.by_adr : by === 'pack' ? s.by_pack : by === 'severity' ? s.by_severity : s.by_rule,
});
