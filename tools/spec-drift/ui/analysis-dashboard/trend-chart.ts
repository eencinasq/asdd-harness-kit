import type { ScanSummary } from '../../src/analysis/analysis.types.ts';

/**
 * Trend chart geometry and labels (spec-drift-adoption REQ-002). One series — new findings when every point had a
 * baseline, else all findings — so no legend: the title names it. Pure; the DOM wiring is in main.ts.
 */

/** Chart units. `top` leaves a band above the plot for the tooltip, so it never covers the title or a point. */
export const CHART = { width: 600, height: 210, left: 40, right: 48, top: 48, bottom: 26 } as const;

/** Round up to 1, 1.5, 2, 3, 4, 5, 6 or 8 × 10^k (at least 2): readable gridlines without half an empty chart. */
export const niceMax = (value: number): number => {
	if (value <= 2) return 2;
	const k = 10 ** Math.floor(Math.log10(value));
	return ([1, 1.5, 2, 3, 4, 5, 6, 8, 10].map((m) => m * k).find((v) => v >= value) as number) ?? value;
};

export type ChartModel = {
	readonly title: string;
	readonly points: readonly {
		readonly at: string;
		readonly label: string;
		readonly value: number;
		readonly x: number;
		readonly y: number;
	}[];
	readonly path: string;
	readonly yMax: number;
	readonly ticks: readonly { readonly value: number; readonly y: number }[];
	readonly verdict: {
		readonly text: string;
		readonly tone: 'tone-success' | 'tone-warning' | '';
		readonly icon: string;
	};
};

export const trendModel = (trend: ScanSummary['trend']): ChartModel | null => {
	if (!trend?.points.length) return null;
	const measure = trend.measure;
	const values = trend.points.map((p) => (measure === 'new' ? (p.new ?? 0) : p.total));
	const yMax = niceMax(Math.max(...values));
	const plotW = CHART.width - CHART.left - CHART.right;
	const plotH = CHART.height - CHART.top - CHART.bottom;
	const n = trend.points.length;
	const xAt = (i: number) => CHART.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
	const yAt = (v: number) => CHART.top + plotH - (v / yMax) * plotH;
	const points = trend.points.map((p, i) => ({
		at: p.at,
		label: p.label,
		value: values[i] as number,
		x: xAt(i),
		y: yAt(values[i] as number),
	}));
	const first = values[0] as number;
	const last = values.at(-1) as number;
	const pct = trend.change === null ? '' : ` (${trend.change > 0 ? '+' : ''}${Math.round(trend.change * 100)}%)`;
	const verdict =
		trend.direction === 'better'
			? { text: `Going down — better: ${first} → ${last}${pct}`, tone: 'tone-success' as const, icon: '↓' }
			: trend.direction === 'worse'
				? { text: `Going up — worse: ${first} → ${last}${pct}`, tone: 'tone-warning' as const, icon: '↑' }
				: trend.direction === 'flat'
					? { text: `Flat: ${first} → ${last}${pct}`, tone: '' as const, icon: '→' }
					: { text: 'One snapshot: record another to see a trend', tone: '' as const, icon: '·' };
	return {
		title: measure === 'new' ? 'New findings (against the baseline) per snapshot' : 'Findings per snapshot',
		points,
		path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
		yMax,
		ticks: [0, yMax / 2, yMax].map((v) => ({ value: v, y: yAt(v) })),
		verdict,
	};
};

/** Index of the point closest to an x in chart units: the crosshair snaps to it. */
export const nearestIndex = (xs: readonly number[], x: number): number => {
	let best = 0;
	for (let i = 1; i < xs.length; i += 1) {
		if (Math.abs((xs[i] as number) - x) < Math.abs((xs[best] as number) - x)) best = i;
	}
	return best;
};
