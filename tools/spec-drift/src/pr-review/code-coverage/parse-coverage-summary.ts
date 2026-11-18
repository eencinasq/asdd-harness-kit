/** Parse Istanbul `coverage-summary.json` (json-summary reporter). */
import type { CoverageFileRow, CoverageTotals } from './code-coverage.types.ts';

type Metric = {
	readonly total?: number;
	readonly covered?: number;
	readonly skipped?: number;
	readonly pct?: number;
};

type SummaryFile = {
	readonly lines?: Metric;
	readonly statements?: Metric;
	readonly functions?: Metric;
	readonly branches?: Metric;
};

const metricPct = (m: Metric | undefined): number => {
	if (typeof m?.pct === 'number' && Number.isFinite(m.pct)) return m.pct;
	const total = m?.total ?? 0;
	const covered = m?.covered ?? 0;
	return total > 0 ? Math.round((covered / total) * 10000) / 100 : 100;
};

const matchPrPath = (key: string, prPaths: readonly string[]): string | undefined => {
	const normalized = key.replace(/\\/g, '/');
	return prPaths.find((p) => {
		const want = p.replace(/\\/g, '/');
		return normalized === want || normalized.endsWith(`/${want}`);
	});
};

export const parseCoverageSummary = (
	raw: string,
	prPaths: readonly string[],
): { readonly totals: CoverageTotals; readonly files: readonly CoverageFileRow[] } => {
	const data = JSON.parse(raw) as Record<string, SummaryFile>;
	const total = data['total'];
	if (!total?.lines) throw new Error('coverage-summary.json has no total.lines');

	const totals: CoverageTotals = {
		linesPct: metricPct(total.lines),
		statementsPct: metricPct(total.statements),
		functionsPct: metricPct(total.functions),
		branchesPct: metricPct(total.branches),
		linesCovered: total.lines.covered ?? 0,
		linesTotal: total.lines.total ?? 0,
	};

	const files: CoverageFileRow[] = [];
	for (const [key, value] of Object.entries(data)) {
		if (key === 'total' || !value?.lines) continue;
		const path = matchPrPath(key, prPaths);
		if (prPaths.length > 0 && !path) continue;
		files.push({
			path: path ?? key.replace(/\\/g, '/'),
			linesPct: metricPct(value.lines),
			linesCovered: value.lines.covered ?? 0,
			linesTotal: value.lines.total ?? 0,
		});
	}

	files.sort((a, b) => a.linesPct - b.linesPct || a.path.localeCompare(b.path));
	return { totals, files: files.slice(0, 100) };
};
